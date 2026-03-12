import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { recordInboundThreadMessage, recordOutboundThreadMessage } from "@/lib/inbox";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { applyRoutingDecision, resolveRouting } from "@/lib/routing";
import { evaluateWorkflows } from "@/lib/workflow-engine";
import { trackEvent } from "@/lib/conversion-analytics";
import type { BotRequest, BotResponse, ChatChannel } from "@/types";

/**
 * POST /api/bot/:tenant_id
 *
 * Endpoint publico del bot para chat web y canales directos.
 * No requiere autenticacion (orientado a clientes finales).
 *
 * Body esperado:
 * { message, session_id?, user_identifier?, channel? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  try {
    const { tenant_id } = await params;

    if (!tenant_id) {
      return NextResponse.json({ error: "tenant_id es requerido" }, { status: 400 });
    }

    const body = await request.json();
    const { message, session_id, user_identifier, channel } = body;
    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    const channelType = (channel || "web") as ChatChannel;
    const inboxUserIdentifier = String(user_identifier || session_id || "web_anonymous");

    if (!normalizedMessage) {
      return NextResponse.json(
        { error: "El campo 'message' es requerido y no puede estar vacio" },
        { status: 400 }
      );
    }

    const rateLimit = checkAIRateLimit(tenant_id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Demasiados mensajes por minuto. Intenta en un momento.",
          retry_after_seconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: rateLimit.retryAfterSeconds
            ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    await recordInboundThreadMessage({
      tenantId: tenant_id,
      channel: channelType,
      userIdentifier: inboxUserIdentifier,
      content: normalizedMessage,
      rawPayload: body,
    });

    const supabase = createServiceClient();
    const { data: threadContext } = await supabase
      .from("conversation_threads")
      .select("id, contact_id")
      .eq("tenant_id", tenant_id)
      .eq("channel", channelType)
      .eq("user_identifier", inboxUserIdentifier)
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
      metadata: { source: "web_bot_api" },
    });

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
        senderId: inboxUserIdentifier,
        contactTags,
        metadata: { source: "web_bot_api" },
      });

      if (workflowOutcome.stopProcessing) {
        const outbound = workflowOutcome.outboundMessages.filter(Boolean);
        const workflowMessage =
          outbound.join("\n\n") ||
          "Listo, registramos tu solicitud y continuamos con el flujo configurado.";

        if (outbound.length > 0) {
          for (const text of outbound) {
            await recordOutboundThreadMessage({
              tenantId: tenant_id,
              channel: channelType,
              userIdentifier: inboxUserIdentifier,
              content: text,
              authorType: "bot",
              resetUnread: true,
              rawPayload: {
                source: "workflow_engine",
                workflow_handled: true,
              },
            });
          }
        } else {
          await recordOutboundThreadMessage({
            tenantId: tenant_id,
            channel: channelType,
            userIdentifier: inboxUserIdentifier,
            content: workflowMessage,
            authorType: "bot",
            resetUnread: true,
            rawPayload: {
              source: "workflow_engine",
              workflow_handled: true,
            },
          });
        }

        const workflowResponse: BotResponse = {
          message: workflowMessage,
          intent_detected: "inquiry",
        };

        return NextResponse.json({
          success: true,
          workflow_handled: true,
          ...workflowResponse,
          bot_response: workflowResponse.message,
        });
      }
    }

    const botRequest: BotRequest = {
      tenant_id,
      user_message: normalizedMessage,
      session_id: session_id || undefined,
      user_identifier: user_identifier || undefined,
      channel: channelType,
    };

    const response = await processMessage(botRequest);

    await recordOutboundThreadMessage({
      tenantId: tenant_id,
      channel: channelType,
      userIdentifier: inboxUserIdentifier,
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
      // Compatibilidad temporal con clientes legacy del widget.
      bot_response: response.message,
    });
  } catch (error) {
    console.error("[Bot API] Error:", error);

    const message =
      error instanceof Error ? error.message : "Error interno del servidor";

    if (message.includes("Tenant no encontrado")) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Error procesando el mensaje. Intenta mas tarde." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bot/:tenant_id
 * Health check del bot
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  const { tenant_id } = await params;
  return NextResponse.json({
    status: "ok",
    tenant_id,
    message: "Bot activo y listo para recibir mensajes",
  });
}
