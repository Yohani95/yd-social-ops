/**
 * Instagram Comments Handler — Fase 3
 *
 * Procesa comentarios públicos de Instagram recibidos via webhook Meta.
 * Decisiones: public_reply | dm_followup | human_handoff | ignore
 *
 * Flujo:
 * 1. Idempotencia vía conversation_events
 * 2. Leer regla de channel_automation_rules
 * 3. Clasificar intención del comentario
 * 4. Decidir acción según confidence + regla
 * 5. Ejecutar acción + registrar evento
 */

import { createServiceClient } from "@/lib/supabase/server";
import { recordConversationEvent, recordQualityEvent } from "@/lib/quality-tracker";
import { recordInboundThreadMessage, recordOutboundThreadMessage } from "@/lib/inbox";
import { ensureContactExists } from "@/lib/contacts";
import type { InstagramCommentEvent, CommentDecision } from "@/types";

// ============================================================
// Graph API helpers
// ============================================================

async function sendCommentReply(
  commentId: string,
  message: string,
  pageAccessToken: string
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${commentId}/replies`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[IGComments] Error enviando reply público:", err);
  }
}

async function sendDmToUser(
  userId: string,
  message: string,
  pageAccessToken: string
): Promise<void> {
  const url = "https://graph.facebook.com/v21.0/me/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: userId },
      message: { text: message },
      access_token: pageAccessToken,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[IGComments] Error enviando DM:", err);
  }
}

// ============================================================
// Simple intent classification for comments
// ============================================================

interface CommentClassification {
  intent: "purchase_intent" | "inquiry" | "complaint" | "greeting" | "unknown";
  confidence: number;
}

function classifyComment(message: string): CommentClassification {
  const lower = message.toLowerCase();

  const purchasePatterns = [
    /\b(precio|costo|cuanto vale|cuanto cuesta|comprar|quiero|pedido|disponible|stock)\b/i,
    /\b(envio|despacho|pago|transferir|efectivo|tarjeta)\b/i,
  ];
  const complaintPatterns = [
    /\b(malo|feo|pesimo|horrible|problema|falla|error|queja|reclamo|devolucion)\b/i,
  ];
  const greetingPatterns = [/\b(hola|buenas|saludos|buen dia|buenas tardes|buenas noches)\b/i];

  for (const p of purchasePatterns) {
    if (p.test(lower)) return { intent: "purchase_intent", confidence: 0.82 };
  }
  for (const p of complaintPatterns) {
    if (p.test(lower)) return { intent: "complaint", confidence: 0.78 };
  }
  for (const p of greetingPatterns) {
    if (p.test(lower)) return { intent: "greeting", confidence: 0.90 };
  }
  if (/\?/.test(message)) {
    return { intent: "inquiry", confidence: 0.70 };
  }

  return { intent: "unknown", confidence: 0.30 };
}

// ============================================================
// Decision logic
// ============================================================

function decideAction(
  classification: CommentClassification,
  ruleConfidenceThreshold: number,
  allowedActions: string[],
  isActive: boolean
): CommentDecision {
  if (!isActive) return "ignore";

  const { confidence } = classification;

  if (confidence < ruleConfidenceThreshold) return "human_handoff";

  if (allowedActions.includes("public_reply")) return "public_reply";
  if (allowedActions.includes("open_dm") || allowedActions.includes("dm_followup")) return "dm_followup";
  if (allowedActions.includes("handoff_agent")) return "human_handoff";

  return "ignore";
}

// ============================================================
// Main handler
// ============================================================

export async function processInstagramComment(params: {
  tenantId: string;
  channelId: string;
  accessToken: string;
  event: InstagramCommentEvent;
}): Promise<void> {
  const { tenantId, channelId, accessToken, event } = params;
  const idempotencyKey = `ig_comment_${event.comment_id}`;
  const startMs = Date.now();

  // 1. Idempotencia: verificar si ya procesamos este comentario
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("conversation_events")
    .select("id, processed")
    .eq("tenant_id", tenantId)
    .eq("event_idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing?.processed) {
    console.info("[IGComments] Comentario ya procesado:", idempotencyKey);
    return;
  }

  // 2. Leer regla de automatización
  const { data: rule } = await supabase
    .from("channel_automation_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("channel", "instagram")
    .eq("event_type", "comment")
    .maybeSingle();

  const isActive = rule?.is_active ?? false;
  const confidenceThreshold = Number(rule?.confidence_threshold ?? 0.7);
  const allowedActions: string[] = rule?.allowed_actions ?? ["auto_reply"];

  // 3. Clasificar intención
  const classification = classifyComment(event.message);

  // 4. Decidir acción
  const decision = decideAction(classification, confidenceThreshold, allowedActions, isActive);

  console.info(`[IGComments] comment_id=${event.comment_id} intent=${classification.intent} confidence=${classification.confidence} decision=${decision}`);

  // 5. Registrar conversation_event
  const convEventId = await recordConversationEvent({
    tenantId,
    channel: "instagram",
    eventType: "comment",
    idempotencyKey,
    sourceMessageId: event.comment_id,
    sourceAuthorId: event.from_id,
    content: event.message,
    metadata: {
      media_id: event.media_id,
      from_username: event.from_username ?? null,
      comment_id: event.comment_id,
    },
  });

  // 6. Ejecutar acción
  let botReply: string | null = null;

  if (decision === "public_reply") {
    // Respuesta pública breve al comentario
    const replyText = buildPublicReply(classification.intent, event.message);
    await sendCommentReply(event.comment_id, replyText, accessToken);
    botReply = replyText;
    console.info("[IGComments] Reply público enviado para", event.comment_id);

  } else if (decision === "dm_followup") {
    // Abrir DM para continuar la conversación
    await ensureContactExists({
      tenantId,
      channel: "instagram",
      identifier: event.from_id,
    });

    const dmText = buildDmFollowup(classification.intent);
    await sendDmToUser(event.from_id, dmText, accessToken);

    await recordInboundThreadMessage({
      tenantId,
      channel: "instagram",
      userIdentifier: event.from_id,
      content: `[Comentario público] ${event.message}`,
      providerMessageId: event.comment_id,
      rawPayload: {
        source: "ig_comment",
        comment_id: event.comment_id,
        media_id: event.media_id,
        from_username: event.from_username ?? null,
      },
    });

    botReply = dmText;
    await recordOutboundThreadMessage({
      tenantId,
      channel: "instagram",
      userIdentifier: event.from_id,
      content: dmText,
      authorType: "bot",
      resetUnread: true,
      rawPayload: { source: "ig_comment_dm_followup", comment_id: event.comment_id },
    });

    console.info("[IGComments] DM enviado a", event.from_id);

  } else if (decision === "human_handoff") {
    // Crear thread abierto para agente humano
    await ensureContactExists({
      tenantId,
      channel: "instagram",
      identifier: event.from_id,
    });

    await recordInboundThreadMessage({
      tenantId,
      channel: "instagram",
      userIdentifier: event.from_id,
      content: `[Comentario — requiere revisión humana] ${event.message}`,
      providerMessageId: event.comment_id,
      rawPayload: {
        source: "ig_comment_handoff",
        comment_id: event.comment_id,
        media_id: event.media_id,
        confidence: classification.confidence,
        intent: classification.intent,
      },
    });

    console.info("[IGComments] Handoff a agente para comentario", event.comment_id);

  } else {
    // ignore
    console.info("[IGComments] Comentario ignorado (regla inactiva o acción=ignore):", event.comment_id);
  }

  // 7. Marcar conversation_event como procesado
  if (convEventId) {
    await supabase
      .from("conversation_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        decision: mapDecisionToAction(decision),
        classification: {
          intent: classification.intent,
          confidence: classification.confidence,
        },
      })
      .eq("id", convEventId);
  }

  // 8. Registrar evento de calidad
  void recordQualityEvent({
    tenantId,
    channel: "instagram",
    eventType: "comment",
    conversationEventId: convEventId,
    userIdentifier: event.from_id,
    userMessageLength: event.message.length,
    responseLength: botReply?.length ?? 0,
    responseLatencyMs: Date.now() - startMs,
    intentDetected: classification.intent,
    isFallbackResponse: false,
    isRepetition: false,
    evaluatorNotes: {
      decision,
      confidence: classification.confidence,
      rule_active: isActive,
    },
  });
}

// ============================================================
// Reply builders
// ============================================================

function buildPublicReply(
  intent: CommentClassification["intent"],
  _originalMessage: string
): string {
  switch (intent) {
    case "purchase_intent":
      return "¡Hola! Te enviamos la información por mensaje directo 😊";
    case "inquiry":
      return "¡Gracias por tu consulta! Te respondemos por DM con todos los detalles.";
    case "complaint":
      return "Lamentamos el inconveniente, te contactamos por DM para ayudarte.";
    case "greeting":
      return "¡Hola! 👋 ¿En qué podemos ayudarte?";
    default:
      return "¡Gracias por tu comentario! Escríbenos por DM para más info.";
  }
}

function buildDmFollowup(intent: CommentClassification["intent"]): string {
  switch (intent) {
    case "purchase_intent":
      return "¡Hola! Vi tu comentario y quiero ayudarte con la información que necesitas. ¿Qué producto o servicio te interesa?";
    case "inquiry":
      return "¡Hola! Vi tu consulta y con gusto te ayudo. ¿Qué necesitas saber?";
    case "complaint":
      return "Hola, lamento que hayas tenido un inconveniente. Cuéntame qué pasó y lo resolvemos.";
    default:
      return "¡Hola! Gracias por escribirnos. ¿En qué te podemos ayudar?";
  }
}

function mapDecisionToAction(
  decision: CommentDecision
): "auto_reply" | "public_reply" | "open_dm" | "handoff_agent" | "ignore" {
  switch (decision) {
    case "public_reply": return "public_reply";
    case "dm_followup": return "open_dm";
    case "human_handoff": return "handoff_agent";
    default: return "ignore";
  }
}
