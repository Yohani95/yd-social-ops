/**
 * Quality Tracker — Fase 1
 *
 * Registra eventos conversacionales y métricas de calidad del bot
 * de forma no-bloqueante (fire-and-forget). No afecta latencia de respuesta.
 */

import { createServiceClient } from "@/lib/supabase/server";

// ============================================================
// Types
// ============================================================

export interface ConversationEventInsert {
  tenantId: string;
  channel: string;
  eventType: "dm" | "comment" | "mention" | "story_reply";
  idempotencyKey: string;
  sourceMessageId?: string | null;
  sourceAuthorId: string;
  content?: string;
  metadata?: Record<string, unknown>;
  threadId?: string | null;
}

export interface QualityEventInsert {
  tenantId: string;
  channel: string;
  eventType?: "dm" | "comment" | "mention" | "story_reply";
  conversationEventId?: string | null;
  threadId?: string | null;
  sessionId?: string | null;
  userIdentifier?: string | null;
  userMessageLength: number;
  responseLength: number;
  responseLatencyMs?: number | null;
  intentDetected?: string | null;
  providerUsed?: string | null;
  tokensUsed?: number;
  isFallbackResponse?: boolean;
  isRepetition?: boolean;
  coherenceScore?: number | null;
  evaluatorNotes?: Record<string, unknown>;
}

// ============================================================
// Repetition detection (simple Levenshtein-based)
// ============================================================

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Detecta si la nueva respuesta es semánticamente repetitiva
 * comparando con las últimas N respuestas del bot en la sesión.
 * Threshold: similitud > 0.85 = repetición.
 */
export function detectRepetition(
  previousBotMessages: string[],
  newResponse: string,
  threshold = 0.85
): boolean {
  if (!newResponse?.trim() || previousBotMessages.length === 0) return false;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s\n\r]+/g, " ")
      .trim()
      .slice(0, 300);

  const normNew = norm(newResponse);
  if (normNew.length < 20) return false;

  for (const prev of previousBotMessages.slice(-5)) {
    const normPrev = norm(prev);
    if (normPrev.length < 20) continue;
    const maxLen = Math.max(normNew.length, normPrev.length);
    const dist = levenshteinDistance(normNew, normPrev);
    const similarity = 1 - dist / maxLen;
    if (similarity >= threshold) return true;
  }

  return false;
}

// ============================================================
// Record functions (fire-and-forget — llamar sin await)
// ============================================================

export async function recordConversationEvent(
  params: ConversationEventInsert
): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("conversation_events")
      .upsert(
        {
          tenant_id: params.tenantId,
          channel: params.channel,
          event_type: params.eventType,
          event_idempotency_key: params.idempotencyKey,
          source_message_id: params.sourceMessageId ?? null,
          source_author_id: params.sourceAuthorId,
          content: params.content ?? "",
          metadata: params.metadata ?? {},
          thread_id: params.threadId ?? null,
        },
        { onConflict: "tenant_id,event_idempotency_key", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[QualityTracker] conversation_events upsert error:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn("[QualityTracker] recordConversationEvent exception:", err);
    return null;
  }
}

export async function recordQualityEvent(params: QualityEventInsert): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("bot_quality_events").insert({
      tenant_id: params.tenantId,
      channel: params.channel,
      event_type: params.eventType ?? "dm",
      conversation_event_id: params.conversationEventId ?? null,
      thread_id: params.threadId ?? null,
      session_id: params.sessionId ?? null,
      user_identifier: params.userIdentifier ?? null,
      user_message_length: params.userMessageLength,
      response_length: params.responseLength,
      response_latency_ms: params.responseLatencyMs ?? null,
      intent_detected: params.intentDetected ?? null,
      provider_used: params.providerUsed ?? null,
      tokens_used: params.tokensUsed ?? 0,
      is_fallback_response: params.isFallbackResponse ?? false,
      is_repetition: params.isRepetition ?? false,
      coherence_score: params.coherenceScore ?? null,
      evaluator_notes: params.evaluatorNotes ?? {},
    });

    if (error) {
      console.warn("[QualityTracker] bot_quality_events insert error:", error.message);
    }
  } catch (err) {
    console.warn("[QualityTracker] recordQualityEvent exception:", err);
  }
}
