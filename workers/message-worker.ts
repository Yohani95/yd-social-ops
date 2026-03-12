import { dequeueBatch, retryEvent, type QueueEvent } from "@/lib/event-queue";
import { evaluateWorkflows } from "@/lib/workflow-engine";
import { processMessage } from "@/lib/ai-service";
import { trackEvent } from "@/lib/conversion-analytics";
import type { ChatChannel, IntentType, WorkflowTriggerType } from "@/types";

interface WorkerMessagePayload {
  trigger_type?: WorkflowTriggerType;
  channel?: ChatChannel;
  user_message?: string;
  user_identifier?: string;
  session_id?: string;
  contact_id?: string | null;
  thread_id?: string | null;
  intent_detected?: string | null;
  payment_status?: string | null;
  product_interest?: string | null;
  contact_tags?: string[];
  metadata?: Record<string, unknown>;
  allow_ai_fallback?: boolean;
  callback_url?: string;
}

async function maybeSendCallback(url: string | undefined, payload: Record<string, unknown>): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[MessageWorker] callback failed:", error);
  }
}

async function processQueueEvent(event: QueueEvent): Promise<void> {
  const payload = (event.payload || {}) as WorkerMessagePayload;
  const triggerType = payload.trigger_type || "message_received";

  const workflowOutcome = await evaluateWorkflows({
    tenantId: event.tenantId,
    triggerType,
    channel: payload.channel,
    message: payload.user_message,
    intentDetected: (payload.intent_detected as IntentType | null) || null,
    paymentStatus: payload.payment_status || null,
    productInterest: payload.product_interest || null,
    contactId: payload.contact_id || null,
    threadId: payload.thread_id || null,
    senderId: payload.user_identifier || null,
    contactTags: payload.contact_tags || [],
    metadata: payload.metadata || {},
    triggerEventId: event.id,
  });

  let aiResponse: Awaited<ReturnType<typeof processMessage>> | null = null;
  if ((payload.allow_ai_fallback ?? true) && !workflowOutcome.stopProcessing && payload.user_message) {
    aiResponse = await processMessage({
      tenant_id: event.tenantId,
      user_message: payload.user_message,
      user_identifier: payload.user_identifier || undefined,
      session_id: payload.session_id || `${payload.channel || "web"}_${payload.user_identifier || "unknown"}`,
      channel: payload.channel || "web",
    });
  }

  await trackEvent({
    tenantId: event.tenantId,
    eventType: "conversation_started",
    channel: payload.channel || null,
    contactId: payload.contact_id || null,
    threadId: payload.thread_id || null,
    actorType: "system",
    metadata: {
      queue_event_id: event.id,
      workflow_matches: workflowOutcome.matchedWorkflows,
      ai_fallback_used: Boolean(aiResponse),
    },
  });

  await maybeSendCallback(payload.callback_url, {
    success: true,
    queue_event_id: event.id,
    workflow: workflowOutcome,
    ai_response: aiResponse,
  });
}

export async function runMessageWorker(params?: { batchSize?: number }): Promise<{
  fetched: number;
  processed: number;
  failed: number;
}> {
  const batchSize = Math.max(1, Math.min(params?.batchSize || 20, 100));
  const events = await dequeueBatch(batchSize);
  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await processQueueEvent(event);
      processed += 1;
    } catch (error) {
      failed += 1;
      console.warn("[MessageWorker] event processing failed:", {
        event_id: event.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      await retryEvent(event.id, event, 30);
    }
  }

  return {
    fetched: events.length,
    processed,
    failed,
  };
}
