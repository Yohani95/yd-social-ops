import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/channel-adapters";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { ensureContactExists } from "@/lib/contacts";
import {
  recordInboundThreadMessage,
  recordOutboundThreadMessage,
} from "@/lib/inbox";
import type { ResendInboundPayload } from "@/lib/channel-adapters/email";
import type { SocialChannel } from "@/types";

/**
 * POST /api/webhooks/email/inbound
 *
 * Recibe emails entrantes de Resend Inbound, los mapea al inbox omnicanal
 * y los procesa con el bot IA del tenant correspondiente.
 *
 * Resolución de tenant: la dirección "to" debe tener una fila activa en
 * social_channels con channel='email' y config->>'inbound_address' coincidente.
 *
 * Setup en Resend: Webhooks → Inbound → apuntar a esta URL.
 * RESEND_INBOUND_WEBHOOK_SECRET = signing secret de Svix.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // ── 1. Verificar firma Svix (Resend Inbound usa Svix internamente) ───
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (webhookSecret) {
    const svixId        = request.headers.get("svix-id") || "";
    const svixTimestamp = request.headers.get("svix-timestamp") || "";
    const svixSignature = request.headers.get("svix-signature") || "";

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing Svix headers" }, { status: 403 });
    }

    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("base64");

    const isValid = svixSignature.split(" ").some((part) => {
      const sigValue = part.split(",").pop() || "";
      return sigValue === expectedSig;
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 2. Anti-loop: ignorar auto-replies ────────────────────────────────
  const hdrs = payload.headers || {};
  const autoReplyKeys = ["x-autoreply", "auto-submitted", "x-auto-response-suppress", "x-autorespond"];
  if (autoReplyKeys.some((k) => hdrs[k] && hdrs[k].toLowerCase() !== "no")) {
    return NextResponse.json({ ok: true, skipped: "auto-reply" });
  }

  // ── 3. Idempotencia por messageId ──────────────────────────────────────
  const messageId = payload.messageId;
  if (messageId) {
    const supabase = createServiceClient();
    const { data: dup } = await supabase
      .from("conversation_messages")
      .select("id")
      .eq("provider_message_id", messageId)
      .maybeSingle();
    if (dup) return NextResponse.json({ ok: true, skipped: "duplicate" });
  }

  // ── 4. Resolver tenant desde dirección "to" ────────────────────────────
  const toAddresses: string[] = payload.to || [];
  let channelRow: SocialChannel | null = null;

  for (const toAddr of toAddresses) {
    const toEmail = toAddr.includes("<")
      ? (toAddr.match(/<([^>]+)>/) || [])[1]?.toLowerCase()
      : toAddr.trim().toLowerCase();
    if (!toEmail) continue;

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("social_channels")
      .select("*")
      .eq("channel_type", "email")
      .eq("is_active", true)
      .filter("config->>'inbound_address'", "eq", toEmail)
      .maybeSingle();

    if (data) {
      channelRow = data as SocialChannel;
      break;
    }
  }

  if (!channelRow) {
    console.warn("[email-inbound] No tenant found for to:", toAddresses);
    return NextResponse.json({ ok: true, skipped: "no_tenant" });
  }

  const tenantId = channelRow.tenant_id;

  // ── 5. Extraer remitente y contenido ──────────────────────────────────
  const fromRaw = payload.from || "";
  const fromEmail = fromRaw.includes("<")
    ? (fromRaw.match(/<([^>]+)>/) || [])[1]?.toLowerCase() || fromRaw
    : fromRaw.trim().toLowerCase();

  const text = (payload.text?.trim() || "").slice(0, 8000);
  if (!text) return NextResponse.json({ ok: true, skipped: "empty_body" });

  // ── 6. Asegurar contacto ──────────────────────────────────────────────
  await ensureContactExists({
    tenantId,
    channel: "email",
    identifier: fromEmail,
  });

  // ── 7. Registrar mensaje entrante ─────────────────────────────────────
  await recordInboundThreadMessage({
    tenantId,
    channel: "email",
    userIdentifier: fromEmail,
    content: text,
    providerMessageId: messageId || null,
    rawPayload: {
      subject:   payload.subject,
      messageId: payload.messageId,
      fromRaw,
      inReplyTo:  payload.inReplyTo,
      references: payload.references,
    },
  });

  // ── 8. Rate limit ─────────────────────────────────────────────────────
  const rateLimit = checkAIRateLimit(tenantId);
  if (!rateLimit.allowed) {
    const msg = "Recibimos tu mensaje. Nuestro equipo te responderá pronto.";
    const adapter = getAdapter("email");
    const replyChannel: SocialChannel = {
      ...channelRow,
      config: {
        ...(channelRow.config as object),
        inReplyTo:  payload.messageId,
        references: [payload.inReplyTo, payload.references].filter(Boolean).join(" "),
        subject:    payload.subject,
      },
    };
    await adapter.sendReply(fromEmail, msg, replyChannel);
    await recordOutboundThreadMessage({
      tenantId,
      channel: "email",
      userIdentifier: fromEmail,
      content: msg,
      authorType: "bot",
      resetUnread: true,
      rawPayload: { source: "email_inbound", rate_limited: true },
    });
    return NextResponse.json({ ok: true });
  }

  // ── 9. Procesar con IA y enviar respuesta ─────────────────────────────
  try {
    const response = await processMessage({
      tenant_id:       tenantId,
      user_message:    text,
      session_id:      `email_${fromEmail}`,
      user_identifier: fromEmail,
      channel:         "email",
    });

    const replyChannel: SocialChannel = {
      ...channelRow,
      config: {
        ...(channelRow.config as object),
        inReplyTo:  payload.messageId,
        references: [payload.inReplyTo, payload.references].filter(Boolean).join(" "),
        subject:    payload.subject,
      },
    };

    const adapter = getAdapter("email");
    const formatted = adapter.formatMessage(response.message);
    await adapter.sendReply(fromEmail, formatted, replyChannel);

    await recordOutboundThreadMessage({
      tenantId,
      channel: "email",
      userIdentifier: fromEmail,
      content: formatted,
      authorType: "bot",
      resetUnread: true,
      rawPayload: {
        source:       "email_inbound",
        intent:       response.intent_detected || null,
        payment_link: response.payment_link || null,
      },
    });
  } catch (err) {
    console.error("[email-inbound] processMessage error:", err);
  }

  return NextResponse.json({ ok: true });
}
