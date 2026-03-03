import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { getAdapter } from "@/lib/channel-adapters";
import { notifyOwnerOnFirstExternalMessage } from "@/lib/owner-alerts";
import { ensureContactExists } from "@/lib/contacts";
import { recordInboundThreadMessage, recordOutboundThreadMessage } from "@/lib/inbox";
import type { BotRequest, SocialChannel } from "@/types";

function composeOutboundMessage(baseMessage: string, paymentLink?: string | null): string {
  const messageText = (baseMessage || "").trim();
  const link = (paymentLink || "").trim();
  if (!link) return messageText;
  if (messageText.includes(link)) return messageText;
  return `${messageText}\n\nLink de pago: ${link}`;
}

/**
 * POST /api/webhooks/tiktok
 *
 * Webhook for TikTok for Business DMs.
 * TikTok sends events to this endpoint when a user sends a DM.
 *
 * Expected format:
 * { event: "receive_message", user_open_id: "...", content: { text: "..." } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const adapter = getAdapter("tiktok");
    const parsed = adapter.parseIncoming(body);

    if (!parsed) {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    const supabase = createServiceClient();

    const { data: channels } = await supabase
      .from("social_channels")
      .select("*")
      .eq("channel_type", "tiktok")
      .eq("is_active", true);

    if (!channels || channels.length === 0) {
      return NextResponse.json({ status: "no_channel" }, { status: 200 });
    }

    const channel = (channels as SocialChannel[]).find(
      (ch) => ch.provider_config?.open_id === parsed.senderId
        || ch.channel_identifier === parsed.senderId
    ) || channels[0] as SocialChannel;

    await ensureContactExists({
      tenantId: channel.tenant_id,
      channel: "tiktok",
      identifier: parsed.senderId,
    });

    await recordInboundThreadMessage({
      tenantId: channel.tenant_id,
      channel: "tiktok",
      userIdentifier: parsed.senderId,
      content: parsed.message,
      rawPayload: body,
    });

    await notifyOwnerOnFirstExternalMessage({
      tenantId: channel.tenant_id,
      channel: "tiktok",
      senderId: parsed.senderId,
      message: parsed.message,
    });

    const rateLimit = checkAIRateLimit(channel.tenant_id);
    if (!rateLimit.allowed) {
      const rateLimitMessage = "Estamos recibiendo muchos mensajes. Intenta nuevamente en un momento.";
      await adapter.sendReply(parsed.senderId, rateLimitMessage, channel);
      await recordOutboundThreadMessage({
        tenantId: channel.tenant_id,
        channel: "tiktok",
        userIdentifier: parsed.senderId,
        content: rateLimitMessage,
        authorType: "bot",
        resetUnread: true,
        rawPayload: { source: "tiktok", rate_limited: true },
      });
      return NextResponse.json({ status: "rate_limited" }, { status: 200 });
    }

    const botRequest: BotRequest = {
      tenant_id: channel.tenant_id,
      user_message: parsed.message,
      session_id: `tiktok_${parsed.senderId}`,
      user_identifier: parsed.senderId,
      channel: "tiktok",
    };

    const response = await processMessage(botRequest);

    const outboundMessage = composeOutboundMessage(response.message, response.payment_link);
    const formattedMessage = adapter.formatMessage(outboundMessage);
    await adapter.sendReply(parsed.senderId, formattedMessage, channel);

    await recordOutboundThreadMessage({
      tenantId: channel.tenant_id,
      channel: "tiktok",
      userIdentifier: parsed.senderId,
      content: formattedMessage,
      authorType: "bot",
      resetUnread: true,
      rawPayload: {
        source: "tiktok",
        intent: response.intent_detected || null,
        product_id: response.product_id || null,
        payment_link: response.payment_link || null,
      },
    });

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[TikTok Webhook] Error:", error);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
