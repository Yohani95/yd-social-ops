import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getMPClient, Payment } from "@/lib/mercadopago";
import { markMerchantPaymentLinkPaid } from "@/lib/merchant-payment-links";
import { notifyN8n } from "@/lib/integrations/n8n";
import { sendPaymentConfirmationEmail } from "@/lib/email";
import { getAdapter } from "@/lib/channel-adapters";
import { getActiveChannelConfig, recordOutboundThreadMessage } from "@/lib/inbox";
import type { ChatChannel } from "@/types";

interface MPPaymentData {
  id?: string | number;
  status?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  payer?: { email?: string };
  transaction_amount?: number;
  currency_id?: string;
}

const CHANNEL_PREFIXES: ChatChannel[] = ["whatsapp", "messenger", "instagram", "tiktok", "web"];

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function formatAmount(amount: number, currency: string): string {
  const normalizedCurrency = (currency || "CLP").toUpperCase();
  if (normalizedCurrency === "CLP") {
    return `$${Math.round(amount).toLocaleString("es-CL")} CLP`;
  }
  return `${amount.toLocaleString("es-CL")} ${normalizedCurrency}`;
}

function resolveConversationTarget(params: {
  metadata: Record<string, unknown>;
  externalReference?: string | null;
}): { channel: ChatChannel | null; userIdentifier: string | null; sessionRef: string | null } {
  const rawChannel = asTrimmedString(params.metadata.channel);
  const rawUserRef = asTrimmedString(params.metadata.user_ref);
  const rawSessionRef = asTrimmedString(params.metadata.session_ref) || asTrimmedString(params.externalReference);

  let channel: ChatChannel | null =
    rawChannel && CHANNEL_PREFIXES.includes(rawChannel as ChatChannel)
      ? (rawChannel as ChatChannel)
      : null;
  let userIdentifier: string | null = rawUserRef;

  if (!channel && rawSessionRef) {
    const inferred = CHANNEL_PREFIXES.find((prefix) => rawSessionRef.startsWith(`${prefix}_`));
    if (inferred) {
      channel = inferred;
    }
  }

  if (!userIdentifier && rawSessionRef && channel && rawSessionRef.startsWith(`${channel}_`)) {
    userIdentifier = rawSessionRef.slice(`${channel}_`.length) || null;
  }

  if (!userIdentifier && rawSessionRef && channel && channel !== "web") {
    userIdentifier = rawSessionRef;
  }

  return {
    channel,
    userIdentifier,
    sessionRef: rawSessionRef,
  };
}

async function notifyApprovedPaymentInConversation(params: {
  tenantId: string;
  productName: string;
  paymentId: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
  externalReference?: string | null;
}): Promise<void> {
  const target = resolveConversationTarget({
    metadata: params.metadata,
    externalReference: params.externalReference,
  });

  if (!target.channel || target.channel === "web" || !target.userIdentifier) {
    return;
  }

  const channelConfig = await getActiveChannelConfig({
    tenantId: params.tenantId,
    channel: target.channel,
  });
  if (!channelConfig) return;

  const amountLabel = formatAmount(params.amount, params.currency);
  const message = `Pago acreditado correctamente. Operacion #${params.paymentId} por ${amountLabel} (${params.productName}).`;

  try {
    const adapter = getAdapter(target.channel);
    const formattedMessage = adapter.formatMessage(message);
    await adapter.sendReply(target.userIdentifier, formattedMessage, channelConfig);
    await recordOutboundThreadMessage({
      tenantId: params.tenantId,
      channel: target.channel,
      userIdentifier: target.userIdentifier,
      content: formattedMessage,
      authorType: "bot",
      resetUnread: true,
      rawPayload: {
        source: "payment_webhook",
        event: "payment_approved",
        payment_id: params.paymentId,
      },
    });
  } catch (error) {
    console.warn("[Payment Webhook] could not send proactive payment confirmation", {
      tenant_id: params.tenantId,
      channel: target.channel,
      user_identifier: target.userIdentifier,
      payment_id: params.paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
    if (process.env.MP_WEBHOOK_SECRET) {
      if (!signatureHeader || !requestId) {
        console.warn("[Payment Webhook] missing signature headers payment=%s", paymentId);
        return NextResponse.json({ error: "missing_signature" }, { status: 401 });
      }
      const valid = validateMPSignature({
        signatureHeader,
        requestId,
        dataId: paymentId,
      });
      if (!valid) {
        console.warn("[Payment Webhook] invalid signature payment=%s", paymentId);
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
      .select("id, email, business_name, mp_access_token")
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
    const externalReference =
      typeof payment.external_reference === "string"
        ? payment.external_reference
        : null;
    const productId = typeof metadata.product_id === "string" ? metadata.product_id : null;
    const merchantPaymentLinkId =
      typeof metadata.merchant_payment_link_id === "string"
        ? metadata.merchant_payment_link_id
        : null;
    const quantityRaw = Number(metadata.quantity || 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.round(quantityRaw)) : 1;
    const payerEmail = payment.payer?.email?.trim() || null;
    const amount = Number(payment.transaction_amount || 0);
    const currency = payment.currency_id || "CLP";
    const enrichedRawPayload = {
      webhook: payload,
      payment: {
        id: String(payment.id),
        status,
        external_reference: externalReference,
        metadata,
        payer_email: payerEmail,
        transaction_amount: amount,
        currency_id: currency,
      },
    };

    const { data: pendingEvent } = await supabase
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
          raw_payload: enrichedRawPayload,
          processed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,payment_id" }
      )
      .select("id")
      .single();

    if (status !== "approved") {
      return NextResponse.json({ received: true, status });
    }

    let productName = "Compra";
    let stockUpdated = false;

    if (productId) {
      const { data: product } = await supabase
        .from("products")
        .select("id, name")
        .eq("id", productId)
        .eq("tenant_id", tenantId)
        .single();

      if (product) {
        productName = product.name || productName;
        const { data: decremented, error: stockError } = await supabase.rpc("decrement_stock", {
          p_product_id: productId,
          p_tenant_id: tenantId,
          p_quantity: quantity,
        });
        stockUpdated = !stockError && decremented === true;
      }
    }

    const notificationRecipients = Array.from(
      new Set(
        [payerEmail, typeof tenant.email === "string" ? tenant.email.trim() : null].filter(
          (value): value is string => Boolean(value)
        )
      )
    );

    let emailSent = false;
    for (const recipient of notificationRecipients) {
      const emailResult = await sendPaymentConfirmationEmail({
        tenantId,
        to: recipient,
        businessName: tenant.business_name || "Tu negocio",
        productName,
        quantity,
        amount,
        currency,
        paymentId: String(payment.id),
      });
      if (emailResult.ok) {
        emailSent = true;
      } else {
        console.warn("[Payment Webhook] email send failed", {
          tenant_id: tenantId,
          payment_id: String(payment.id),
          recipient,
          reason: emailResult.reason || "unknown",
        });
      }
    }

    const { data: processedEvent } = await supabase
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
          raw_payload: enrichedRawPayload,
          stock_updated: stockUpdated,
          email_sent: emailSent,
          processed: true,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,payment_id" }
      )
      .select("id")
      .single();

    if (merchantPaymentLinkId) {
      await markMerchantPaymentLinkPaid({
        tenantId,
        linkId: merchantPaymentLinkId,
        paymentEventId:
          (typeof processedEvent?.id === "string" && processedEvent.id) ||
          (typeof pendingEvent?.id === "string" && pendingEvent.id) ||
          null,
      });
    }

    await notifyApprovedPaymentInConversation({
      tenantId,
      productName,
      paymentId: String(payment.id),
      amount,
      currency,
      metadata,
      externalReference,
    });

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
