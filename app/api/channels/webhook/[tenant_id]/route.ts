import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { notifyOwnerOnFirstExternalMessage } from "@/lib/owner-alerts";
import { ensureContactExists } from "@/lib/contacts";
import { recordInboundThreadMessage, recordOutboundThreadMessage } from "@/lib/inbox";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { evaluateWorkflows } from "@/lib/workflow-engine";
import { trackEvent } from "@/lib/conversion-analytics";
import { applyRoutingDecision, resolveRouting } from "@/lib/routing";
import { enqueueEvent } from "@/lib/event-queue";
import type { BotRequest, ChatChannel } from "@/types";

/**
 * POST /api/channels/webhook/:tenant_id
 *
 * Webhook genérico para recibir mensajes de canales externos.
 * Servicios como Twilio, MessageBird o integraciones custom
 * envían mensajes a esta URL.
 *
 * Body: { channel, sender_id, message, metadata?, webhook_secret? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  try {
    const { tenant_id } = await params;
    const body = await request.json();
    const { channel, sender_id, message, webhook_secret } = body;
    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    const userIdentifier = String(sender_id || `${channel}_unknown`);

    if (!normalizedMessage) {
      return NextResponse.json(
        { error: "El campo 'message' es requerido" },
        { status: 400 }
      );
    }
    if (!channel) {
      return NextResponse.json(
        { error: "El campo 'channel' es requerido" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: channelConfig } = await supabase
      .from("social_channels")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("channel_type", channel)
      .eq("is_active", true)
      .single();

    if (!channelConfig) {
      return NextResponse.json(
        { error: `Canal '${channel}' no configurado o inactivo para este tenant` },
        { status: 404 }
      );
    }

    const storedSecret = channelConfig.config?.webhook_secret;
    if (storedSecret && storedSecret !== webhook_secret) {
      return NextResponse.json({ error: "webhook_secret inválido" }, { status: 401 });
    }

    const channelType = channel as ChatChannel;
    if (sender_id && channelType !== "web") {
      await ensureContactExists({
        tenantId: tenant_id,
        channel: channelType,
        identifier: String(sender_id),
      });

      await notifyOwnerOnFirstExternalMessage({
        tenantId: tenant_id,
        channel: channelType,
        senderId: String(sender_id),
        message: normalizedMessage,
      });
    }

    await recordInboundThreadMessage({
      tenantId: tenant_id,
      channel: channelType,
      userIdentifier,
      content: normalizedMessage,
      rawPayload: body,
    });

    const { data: threadContext } = await supabase
      .from("conversation_threads")
      .select("id, contact_id")
      .eq("tenant_id", tenant_id)
      .eq("channel", channelType)
      .eq("user_identifier", userIdentifier)
      .maybeSingle();

    let contactTags: string[] = [];
    if (threadContext?.contact_id) {
      const { data: contactData } = await supabase
        .from("contacts")
        .select("tags")
        .eq("tenant_id", tenant_id)
        .eq("id", threadContext.contact_id)
        .maybeSingle();
      contactTags = (contactData?.tags || []) as string[];
    }

    await trackEvent({
      tenantId: tenant_id,
      eventType: "conversation_started",
      channel: channelType,
      contactId: threadContext?.contact_id || null,
      threadId: threadContext?.id || null,
      actorType: "system",
      metadata: { source: "generic_webhook" },
    });

    const eventQueueEnabled = await isFeatureEnabled(tenant_id, "event_queue_enabled");
    if (eventQueueEnabled) {
      await enqueueEvent({
        tenantId: tenant_id,
        type: "message_received",
        payload: {
          trigger_type: "message_received",
          channel,
          user_message: normalizedMessage,
          user_identifier: String(sender_id || ""),
          session_id: `${channel}_${sender_id || "unknown"}`,
          contact_id: threadContext?.contact_id || null,
          thread_id: threadContext?.id || null,
          contact_tags: contactTags,
          allow_ai_fallback: true,
          metadata: { source: "generic_webhook" },
        },
      });
    }

    const routingEnabled = await isFeatureEnabled(tenant_id, "routing_enabled");
    if (routingEnabled && threadContext?.id) {
      const routingDecision = await resolveRouting({
        tenantId: tenant_id,
        threadId: threadContext.id,
        contactId: threadContext.contact_id || null,
        channel: channelType,
        contactTags,
      });
      if (routingDecision.matched) {
        await applyRoutingDecision({
          tenantId: tenant_id,
          threadId: threadContext.id,
          contactId: threadContext.contact_id || null,
          channel: channelType,
          decision: routingDecision,
        });
      }
    }

    const workflowEnabled = await isFeatureEnabled(tenant_id, "workflow_engine_enabled");
    if (workflowEnabled) {
      const workflowOutcome = await evaluateWorkflows({
        tenantId: tenant_id,
        triggerType: "message_received",
        channel: channelType,
        message: normalizedMessage,
        contactId: threadContext?.contact_id || null,
        threadId: threadContext?.id || null,
        senderId: String(sender_id || ""),
        contactTags,
        metadata: { source: "generic_webhook" },
      });

      if (workflowOutcome.stopProcessing) {
        const outbound = workflowOutcome.outboundMessages.filter(Boolean);
        if (outbound.length > 0) {
          for (const text of outbound) {
            await recordOutboundThreadMessage({
              tenantId: tenant_id,
              channel: channelType,
              userIdentifier,
              content: text,
              authorType: "bot",
              resetUnread: true,
              rawPayload: {
                source: "workflow_engine",
                workflow_handled: true,
              },
            });
          }
        }

        return NextResponse.json({
          success: true,
          workflow_handled: true,
          messages: outbound,
        });
      }
    }

    const rateLimit = checkAIRateLimit(tenant_id);
    if (!rateLimit.allowed) {
      const rateLimitMessage = "Demasiados mensajes. Intenta en un momento.";
      await recordOutboundThreadMessage({
        tenantId: tenant_id,
        channel: channelType,
        userIdentifier,
        content: rateLimitMessage,
        authorType: "bot",
        resetUnread: true,
        rawPayload: { source: "generic_webhook", rate_limited: true },
      });
      return NextResponse.json(
        { error: rateLimitMessage, retry_after_seconds: rateLimit.retryAfterSeconds },
        { status: 429 }
      );
    }

    const botRequest: BotRequest = {
      tenant_id,
      user_message: normalizedMessage,
      session_id: `${channel}_${sender_id || "unknown"}`,
      user_identifier: sender_id || undefined,
      channel: channelType,
    };

    const response = await processMessage(botRequest);

    await recordOutboundThreadMessage({
      tenantId: tenant_id,
      channel: channelType,
      userIdentifier,
      content: response.message,
      authorType: "bot",
      resetUnread: true,
      rawPayload: {
        intent: response.intent_detected || null,
        product_id: response.product_id || null,
        payment_link: response.payment_link || null,
      },
    });

    return NextResponse.json({
      success: true,
      ...response,
    });
  } catch (error) {
    console.error("[Channel Webhook] Error:", error);
    return NextResponse.json(
      { error: "Error procesando el mensaje" },
      { status: 500 }
    );
  }
}
