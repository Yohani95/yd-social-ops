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
import { evaluateWorkflows } from "@/lib/workflow-engine";
import { isFeatureEnabled } from "@/lib/feature-flags";
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
    throw new Error(`[IGComments] Error enviando reply público: ${err}`);
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
    throw new Error(`[IGComments] Error enviando DM: ${err}`);
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
  accessToken: string;
  event: InstagramCommentEvent;
}): Promise<void> {
  const { tenantId, accessToken, event } = params;
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

  // 2. Leer regla de automatización + config del tenant
  const [{ data: rule }, { data: botConfig }] = await Promise.all([
    supabase
      .from("channel_automation_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("channel", "instagram")
      .eq("event_type", "comment")
      .maybeSingle(),
    supabase
      .from("tenant_bot_configs")
      .select("channel_overrides")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  // Leer config de respuesta pública al abrir DM
  const igOverrides = (botConfig?.channel_overrides as Record<string, Record<string, unknown>> | null)?.instagram ?? {};
  const dmPublicAckEnabled = igOverrides.dm_public_ack_enabled === true;
  const dmPublicAckText = typeof igOverrides.dm_public_ack_text === "string" && igOverrides.dm_public_ack_text.trim()
    ? igOverrides.dm_public_ack_text.trim()
    : "¡Hola! Te envío la información por mensaje directo 💬";

  const isActive = rule?.is_active ?? false;
  const confidenceThreshold = Number(rule?.confidence_threshold ?? 0.7);
  const allowedActions: string[] = rule?.allowed_actions ?? ["auto_reply"];

  // 3. Clasificar intención
  const classification = classifyComment(event.message);

  // 4. Decidir acción
  let decision = decideAction(classification, confidenceThreshold, allowedActions, isActive);

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
  let workflowHandled = false;

  const workflowEnabled = await isFeatureEnabled(tenantId, "workflow_engine_enabled");
  if (workflowEnabled) {
    await ensureContactExists({
      tenantId,
      channel: "instagram",
      identifier: event.from_id,
    });

    const { data: contactData } = await supabase
      .from("contacts")
      .select("id, tags")
      .eq("tenant_id", tenantId)
      .eq("channel", "instagram")
      .eq("identifier", event.from_id)
      .maybeSingle();

    const workflowOutcome = await evaluateWorkflows({
      tenantId,
      triggerType: "comment_received",
      channel: "instagram",
      message: event.message,
      intentDetected: classification.intent,
      contactId: contactData?.id || null,
      senderId: event.from_id,
      contactTags: (contactData?.tags || []) as string[],
      triggerEventId: convEventId,
      metadata: {
        source: "ig_comment",
        comment_id: event.comment_id,
        media_id: event.media_id,
      },
    });

    for (const workflowMessage of workflowOutcome.outboundMessages) {
      await sendDmToUser(event.from_id, workflowMessage, accessToken);
      await recordOutboundThreadMessage({
        tenantId,
        channel: "instagram",
        userIdentifier: event.from_id,
        content: workflowMessage,
        authorType: "bot",
        resetUnread: true,
        rawPayload: {
          source: "workflow_comment",
          workflow_matches: workflowOutcome.matchedWorkflows,
          comment_id: event.comment_id,
        },
      });
      botReply = workflowMessage;
    }

    if (workflowOutcome.stopProcessing) {
      workflowHandled = true;
      decision = "ignore";
    }
  }

  if (!workflowHandled && decision === "public_reply") {
    // Respuesta pública breve al comentario
    const replyText = buildPublicReply(classification.intent);
    await sendCommentReply(event.comment_id, replyText, accessToken);
    botReply = replyText;
    console.info("[IGComments] Reply público enviado para", event.comment_id);

  } else if (!workflowHandled && decision === "dm_followup") {
    // Abrir DM para continuar la conversación
    await ensureContactExists({
      tenantId,
      channel: "instagram",
      identifier: event.from_id,
    });

    const dmText = buildDmFollowup(classification.intent);
    await sendDmToUser(event.from_id, dmText, accessToken);

    // Respuesta pública de acuse cuando se abre DM (configurable por tenant)
    if (dmPublicAckEnabled) {
      try {
        const ackText = applyAckTemplate(dmPublicAckText, event.from_username, classification.intent);
        await sendCommentReply(event.comment_id, ackText, accessToken);
        console.info("[IGComments] Acuse público de DM enviado para", event.comment_id);
      } catch (err) {
        console.warn("[IGComments] No se pudo enviar acuse público de DM:", err);
      }
    }

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

  } else if (!workflowHandled && decision === "human_handoff") {
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
// Reply builders — variantes múltiples para evitar repetición
// ============================================================

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PUBLIC_REPLY_VARIANTS: Record<CommentClassification["intent"], string[]> = {
  purchase_intent: [
    "¡Hola! Te enviamos toda la info por mensaje directo 😊",
    "¡Claro! Te mando los detalles por DM ahora mismo 📩",
    "¡Hola! Revisa tu DM, te envío la información 💬",
    "¡Con gusto! Te escribo por privado con todo lo que necesitas 🙌",
  ],
  inquiry: [
    "¡Gracias por tu consulta! Te respondemos por DM con todos los detalles.",
    "¡Buena pregunta! Te escribimos por privado para ayudarte mejor 📩",
    "¡Hola! Te enviamos la respuesta completa por mensaje directo 💬",
    "¡Claro que sí! Revisa tu DM, te explicamos todo 😊",
  ],
  complaint: [
    "Lamentamos el inconveniente, te contactamos por DM para resolverlo.",
    "Entendemos tu situación, te escribimos por privado para ayudarte 🙏",
    "¡Hola! Ya te envié un DM para solucionar esto cuanto antes.",
    "Nos importa tu experiencia, revisa tu DM para que te atendamos 💬",
  ],
  greeting: [
    "¡Hola! 👋 ¿En qué podemos ayudarte? Te escribimos por DM.",
    "¡Bienvenido/a! Revisa tu DM, estamos para servirte 😊",
    "¡Hola! Encantados de saludarte. Te enviamos un DM 👋",
    "¡Buenas! Cuéntanos en qué te podemos ayudar, ya te escribimos 💬",
  ],
  unknown: [
    "¡Gracias por tu comentario! Escríbenos por DM para más info.",
    "¡Hola! Te enviamos un mensaje directo para ayudarte mejor 💬",
    "¡Gracias! Revisa tu DM, te contactamos ahora 📩",
    "¡Hola! Charlemos por privado para ayudarte de la mejor manera 😊",
  ],
};

const DM_FOLLOWUP_VARIANTS: Record<CommentClassification["intent"], string[]> = {
  purchase_intent: [
    "¡Hola! Vi tu comentario y quiero ayudarte con la información. ¿Qué producto o servicio te interesa?",
    "¡Hola! Noté tu consulta y con gusto te ayudo. ¿Qué necesitas saber sobre precios o disponibilidad?",
    "¡Buenas! Vi que estás interesado/a. Cuéntame qué necesitas y te ayudo 😊",
    "¡Hola! Aquí para ayudarte con lo que necesites. ¿Qué estás buscando?",
  ],
  inquiry: [
    "¡Hola! Vi tu consulta y con gusto te ayudo. ¿Qué necesitas saber?",
    "¡Buenas! Cuéntame tu pregunta en detalle y te respondo todo 😊",
    "¡Hola! Estoy aquí para resolver tus dudas. ¿En qué puedo ayudarte?",
    "¡Hola! Vi tu mensaje, dime qué necesitas y lo resolvemos juntos 💬",
  ],
  complaint: [
    "Hola, lamento que hayas tenido un inconveniente. Cuéntame qué pasó y lo resolvemos.",
    "¡Hola! Entiendo tu molestia, estoy aquí para ayudarte. ¿Qué ocurrió?",
    "Hola, nos importa mucho tu experiencia. Cuéntame el problema y lo solucionamos.",
    "¡Hola! Vi tu comentario y quiero ayudarte a resolver esto cuanto antes. ¿Qué pasó?",
  ],
  greeting: [
    "¡Hola! Gracias por escribirnos. ¿En qué te podemos ayudar hoy?",
    "¡Bienvenido/a! Cuéntame en qué puedo ayudarte 😊",
    "¡Hola! Encantados de saludarte. ¿Qué necesitas?",
    "¡Buenas! Dime cómo puedo ayudarte 🙌",
  ],
  unknown: [
    "¡Hola! Gracias por escribirnos. ¿En qué te podemos ayudar?",
    "¡Hola! Vi tu comentario. ¿En qué puedo ayudarte hoy? 😊",
    "¡Buenas! Cuéntame qué necesitas y con gusto te ayudo 💬",
    "¡Hola! Dime en qué puedo servirte 🙌",
  ],
};

function buildPublicReply(intent: CommentClassification["intent"]): string {
  return pickRandom(PUBLIC_REPLY_VARIANTS[intent] ?? PUBLIC_REPLY_VARIANTS.unknown);
}

function buildDmFollowup(intent: CommentClassification["intent"]): string {
  return pickRandom(DM_FOLLOWUP_VARIANTS[intent] ?? DM_FOLLOWUP_VARIANTS.unknown);
}

/** Aplica variables de plantilla al texto de acuse público de DM.
 *  Variables soportadas: {{username}}, {{intent}}
 */
function applyAckTemplate(
  template: string,
  username: string | undefined,
  intent: CommentClassification["intent"]
): string {
  const intentLabel: Record<string, string> = {
    purchase_intent: "tu consulta de compra",
    inquiry: "tu consulta",
    complaint: "tu comentario",
    greeting: "tu saludo",
    unknown: "tu mensaje",
  };
  return template
    .replace(/\{\{username\}\}/gi, username ? `@${username}` : "")
    .replace(/\{\{intent\}\}/gi, intentLabel[intent] ?? "tu mensaje")
    .trim();
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
