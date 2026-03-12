import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { getAdapter } from "@/lib/channel-adapters";
import { notifyOwnerOnFirstExternalMessage } from "@/lib/owner-alerts";
import { ensureContactExists } from "@/lib/contacts";
import { recordInboundThreadMessage, recordOutboundThreadMessage } from "@/lib/inbox";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { evaluateWorkflows } from "@/lib/workflow-engine";
import { trackEvent } from "@/lib/conversion-analytics";
import { applyRoutingDecision, resolveRouting } from "@/lib/routing";
import { enqueueEvent } from "@/lib/event-queue";
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

    const { data: threadContext } = await supabase
      .from("conversation_threads")
      .select("id, contact_id")
      .eq("tenant_id", channel.tenant_id)
      .eq("channel", "tiktok")
      .eq("user_identifier", parsed.senderId)
      .maybeSingle();

    let contactTags: string[] = [];
    if (threadContext?.contact_id) {
      const { data: contactData } = await supabase
        .from("contacts")
        .select("tags")
        .eq("tenant_id", channel.tenant_id)
        .eq("id", threadContext.contact_id)
        .maybeSingle();
      contactTags = (contactData?.tags || []) as string[];
    }

    await trackEvent({
      tenantId: channel.tenant_id,
      eventType: "conversation_started",
      channel: "tiktok",
      contactId: threadContext?.contact_id || null,
      threadId: threadContext?.id || null,
      actorType: "system",
      metadata: { source: "tiktok_webhook" },
    });

    const eventQueueEnabled = await isFeatureEnabled(channel.tenant_id, "event_queue_enabled");
    if (eventQueueEnabled) {
      await enqueueEvent({
        tenantId: channel.tenant_id,
        type: "message_received",
        payload: {
          trigger_type: "message_received",
          channel: "tiktok",
          user_message: parsed.message,
          user_identifier: parsed.senderId,
          session_id: `tiktok_${parsed.senderId}`,
          contact_id: threadContext?.contact_id || null,
          thread_id: threadContext?.id || null,
          contact_tags: contactTags,
          allow_ai_fallback: true,
          metadata: { source: "tiktok_webhook" },
        },
      });
    }

    const routingEnabled = await isFeatureEnabled(channel.tenant_id, "routing_enabled");
    if (routingEnabled && threadContext?.id) {
      const routingDecision = await resolveRouting({
        tenantId: channel.tenant_id,
        threadId: threadContext.id,
        contactId: threadContext.contact_id || null,
        channel: "tiktok",
        contactTags,
      });
      if (routingDecision.matched) {
        await applyRoutingDecision({
          tenantId: channel.tenant_id,
          threadId: threadContext.id,
          contactId: threadContext.contact_id || null,
          decision: routingDecision,
        });
      }
    }

    const workflowEnabled = await isFeatureEnabled(channel.tenant_id, "workflow_engine_enabled");
    if (workflowEnabled) {
      const workflowOutcome = await evaluateWorkflows({
        tenantId: channel.tenant_id,
        triggerType: "message_received",
        channel: "tiktok",
        message: parsed.message,
        contactId: threadContext?.contact_id || null,
        threadId: threadContext?.id || null,
        senderId: parsed.senderId,
        contactTags,
        metadata: { source: "tiktok_webhook" },
      });

      for (const workflowMessage of workflowOutcome.outboundMessages) {
        const formatted = adapter.formatMessage(workflowMessage);
        await adapter.sendReply(parsed.senderId, formatted, channel);
        await recordOutboundThreadMessage({
          tenantId: channel.tenant_id,
          channel: "tiktok",
          userIdentifier: parsed.senderId,
          content: formatted,
          authorType: "bot",
          resetUnread: true,
          rawPayload: {
            source: "workflow",
            workflow_matches: workflowOutcome.matchedWorkflows,
          },
        });
      }

      if (workflowOutcome.stopProcessing) {
        return NextResponse.json({ status: "workflow_handled" }, { status: 200 });
      }
    }

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
