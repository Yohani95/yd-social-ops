import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * POST /api/webhooks/saas-subscription
 *
 * Webhook de Mercado Pago para pagos de tu SaaS.
 * Cuando un tenant paga su suscripción, actualiza su estado.
 *
 * Configurar en: https://www.mercadopago.cl/developers/es/docs/notifications/webhooks
 * URL del webhook: https://tudominio.com/api/webhooks/saas-subscription
 */
export async function POST(request: NextRequest) {
  try {
    // Validar firma del webhook de MP
    const signature = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    const body = await request.text();

    if (signature && requestId && process.env.MP_WEBHOOK_SECRET) {
      const isValid = validateMPSignature(body, signature, requestId);
      if (!isValid) {
        console.warn("[SaaS Webhook] Firma inválida recibida");
        return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const { type, data } = payload;

    // Solo procesar eventos de pago
    if (type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return NextResponse.json({ received: true });
    }

    // Consultar el pago en la API de MP con TU token
    const paymentData = await fetchPaymentFromMP(paymentId);

    if (!paymentData) {
      return NextResponse.json({ received: true });
    }

    const { status, metadata, payer } = paymentData;

    // Solo actuar en pagos aprobados
    if (status !== "approved") {
      return NextResponse.json({ received: true });
    }

    const tenantEmail = metadata?.payer_email || payer?.email;
    const planTier = metadata?.plan_tier || "basic";

    if (!tenantEmail) {
      console.warn("[SaaS Webhook] No se encontró email del pagador");
      return NextResponse.json({ received: true });
    }

    // Actualizar estado de suscripción del tenant
    const supabase = createServiceClient();

    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        saas_subscription_status: "active",
        saas_subscription_id: String(paymentId),
        plan_tier: planTier,
        // Extender trial si aplica
        trial_ends_at: null,
      })
      .eq("email", tenantEmail);

    if (updateError) {
      console.error("[SaaS Webhook] Error actualizando tenant:", updateError);
      return NextResponse.json(
        { error: "Error actualizando suscripción" },
        { status: 500 }
      );
    }

    console.log(`[SaaS Webhook] Suscripción activada para ${tenantEmail} (plan: ${planTier})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SaaS Webhook] Error:", error);
    return NextResponse.json(
      { error: "Error procesando webhook" },
      { status: 500 }
    );
  }
}

/**
 * Valida la firma HMAC-SHA256 del webhook de Mercado Pago.
 */
function validateMPSignature(
  body: string,
  signature: string,
  requestId: string
): boolean {
  try {
    const secret = process.env.MP_WEBHOOK_SECRET!;

    // Formato de firma MP: ts=timestamp,v1=hash
    const parts = signature.split(",");
    const ts = parts.find((p) => p.startsWith("ts="))?.split("=")[1];
    const v1 = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

    if (!ts || !v1) return false;

    const manifest = `id:${requestId};request-id:${requestId};ts:${ts};`;
    const expectedHash = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(v1, "hex"),
      Buffer.from(expectedHash, "hex")
    );
  } catch {
    return false;
  }
}

interface MPPayment {
  status: string;
  metadata?: Record<string, string>;
  payer?: { email?: string };
}

/**
 * Consulta los datos de un pago en la API de Mercado Pago.
 */
async function fetchPaymentFromMP(
  paymentId: string
): Promise<MPPayment | null> {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      }
    );

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
