import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getMPClient, Payment } from "@/lib/mercadopago";
import { notifyN8n } from "@/lib/integrations/n8n";
import { sendPaymentConfirmationEmail } from "@/lib/email";

interface MPPaymentData {
  id?: string | number;
  status?: string;
  metadata?: Record<string, unknown>;
  payer?: { email?: string };
  transaction_amount?: number;
  currency_id?: string;
}

function parseSignature(signature: string): { ts?: string; v1?: string } {
  const parts = signature.split(",");
  return {
    ts: parts.find((p) => p.startsWith("ts="))?.split("=")[1],
    v1: parts.find((p) => p.startsWith("v1="))?.split("=")[1],
  };
}

function validateMPSignature(params: {
  signatureHeader: string;
  requestId: string;
  dataId: string;
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;

  const parsed = parseSignature(params.signatureHeader);
  if (!parsed.ts || !parsed.v1) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${parsed.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(parsed.v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function extractPaymentId(request: NextRequest, payload: Record<string, unknown>): string | null {
  const fromPayload = (payload?.data as { id?: string | number } | undefined)?.id;
  if (fromPayload) return String(fromPayload);

  const qp = request.nextUrl.searchParams;
  return qp.get("data.id") || qp.get("id");
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};

    const eventType = String(
      payload.type ||
      payload.topic ||
      request.nextUrl.searchParams.get("type") ||
      request.nextUrl.searchParams.get("topic") ||
      ""
    );

    if (eventType && eventType !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = extractPaymentId(request, payload);
    if (!paymentId) {
      return NextResponse.json({ received: true });
    }

    const signatureHeader = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    if (signatureHeader && requestId && process.env.MP_WEBHOOK_SECRET) {
      const valid = validateMPSignature({
        signatureHeader,
        requestId,
        dataId: paymentId,
      });
      if (!valid) {
        console.warn("[Payment Webhook] invalid signature");
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
    }

    const tenantId = request.nextUrl.searchParams.get("tenant_id");
    if (!tenantId) {
      console.warn("[Payment Webhook] missing tenant_id query param");
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, business_name, mp_access_token")
      .eq("id", tenantId)
      .single();

    if (!tenant?.mp_access_token) {
      console.warn("[Payment Webhook] tenant missing MP token tenant=%s", tenantId);
      return NextResponse.json({ received: true });
    }

    const { data: existing } = await supabase
      .from("payment_events")
      .select("id, processed")
      .eq("tenant_id", tenantId)
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existing?.processed) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    const paymentClient = new Payment(getMPClient(tenant.mp_access_token));
    const payment = (await paymentClient.get({ id: Number(paymentId) })) as unknown as MPPaymentData;
    if (!payment?.id) {
      return NextResponse.json({ received: true });
    }

    const metadata = payment.metadata || {};
    const metadataTenant = typeof metadata.tenant_id === "string" ? metadata.tenant_id : null;
    if (metadataTenant && metadataTenant !== tenantId) {
      console.warn("[Payment Webhook] tenant mismatch query=%s metadata=%s", tenantId, metadataTenant);
      return NextResponse.json({ received: true });
    }

    const status = String(payment.status || "unknown");
    const productId = typeof metadata.product_id === "string" ? metadata.product_id : null;
    const quantityRaw = Number(metadata.quantity || 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.round(quantityRaw)) : 1;
    const payerEmail = payment.payer?.email?.trim() || null;
    const amount = Number(payment.transaction_amount || 0);
    const currency = payment.currency_id || "CLP";

    await supabase
      .from("payment_events")
      .upsert(
        {
          tenant_id: tenantId,
          payment_id: paymentId,
          status,
          product_id: productId,
          quantity,
          payer_email: payerEmail,
          amount,
          currency,
          raw_payload: payload,
          processed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,payment_id" }
      );

    if (status !== "approved") {
      return NextResponse.json({ received: true, status });
    }

    let productName = "Compra";
    let stockUpdated = false;

    if (productId) {
      const { data: product } = await supabase
        .from("products")
        .select("id, name, stock")
        .eq("id", productId)
        .eq("tenant_id", tenantId)
        .single();

      if (product) {
        productName = product.name || productName;
        const nextStock = Math.max(0, Number(product.stock || 0) - quantity);
        const { error: stockError } = await supabase
          .from("products")
          .update({ stock: nextStock, updated_at: new Date().toISOString() })
          .eq("id", productId)
          .eq("tenant_id", tenantId);

        stockUpdated = !stockError;
      }
    }

    let emailSent = false;
    if (payerEmail) {
      const emailResult = await sendPaymentConfirmationEmail({
        tenantId,
        to: payerEmail,
        businessName: tenant.business_name || "Tu negocio",
        productName,
        quantity,
        amount,
        currency,
        paymentId: String(payment.id),
      });
      emailSent = emailResult.ok;
    }

    await supabase
      .from("payment_events")
      .upsert(
        {
          tenant_id: tenantId,
          payment_id: paymentId,
          status,
          product_id: productId,
          quantity,
          payer_email: payerEmail,
          amount,
          currency,
          raw_payload: payload,
          stock_updated: stockUpdated,
          email_sent: emailSent,
          processed: true,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,payment_id" }
      );

    void notifyN8n("payment_approved", {
      tenant_id: tenantId,
      payment_id: paymentId,
      product_id: productId,
      quantity,
      amount,
      currency,
      payer_email: payerEmail,
      stock_updated: stockUpdated,
      email_sent: emailSent,
    }, { tenantId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Payment Webhook] Error:", error);
    return NextResponse.json({ received: true });
  }
}
