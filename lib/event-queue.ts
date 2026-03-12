import { randomUUID } from "crypto";

export interface QueueEvent {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  availableAt: string;
  createdAt: string;
}

const QUEUE_KEY = process.env.EVENT_QUEUE_KEY || "ydso:event-queue:v1";
const DLQ_KEY = process.env.EVENT_QUEUE_DLQ_KEY || "ydso:event-queue:dlq:v1";
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const hasUpstash = Boolean(upstashUrl && upstashToken);

const inMemoryQueue: QueueEvent[] = [];

async function upstashCommand(args: Array<string | number>): Promise<unknown> {
  if (!upstashUrl || !upstashToken) throw new Error("upstash_not_configured");
  const res = await fetch(upstashUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstashToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash_http_${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

function normalizeEvent(input: Omit<QueueEvent, "id" | "attempts" | "createdAt" | "availableAt"> & Partial<QueueEvent>): QueueEvent {
  return {
    id: input.id || randomUUID(),
    tenantId: input.tenantId,
    type: input.type,
    payload: input.payload || {},
    attempts: Number.isFinite(input.attempts) ? Number(input.attempts) : 0,
    availableAt: input.availableAt || new Date().toISOString(),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export async function enqueueEvent(event: Omit<QueueEvent, "id" | "attempts" | "createdAt" | "availableAt"> & Partial<QueueEvent>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const normalized = normalizeEvent(event);

  if (!hasUpstash) {
    inMemoryQueue.push(normalized);
    return { ok: true, id: normalized.id };
  }

  try {
    await upstashCommand(["RPUSH", QUEUE_KEY, JSON.stringify(normalized)]);
    return { ok: true, id: normalized.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "enqueue_failed";
    console.warn("[EventQueue] enqueue error:", message);
    return { ok: false, error: message };
  }
}

function isReady(event: QueueEvent): boolean {
  return new Date(event.availableAt).getTime() <= Date.now();
}

function safeParseEvent(raw: unknown): QueueEvent | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as QueueEvent;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id || !parsed.tenantId || !parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function dequeueBatch(limit = 20): Promise<QueueEvent[]> {
  const batchSize = Math.max(1, Math.min(limit, 200));
  if (!hasUpstash) {
    const ready = inMemoryQueue.filter(isReady).slice(0, batchSize);
    const ids = new Set(ready.map((e) => e.id));
    for (let i = inMemoryQueue.length - 1; i >= 0; i -= 1) {
      if (ids.has(inMemoryQueue[i].id)) inMemoryQueue.splice(i, 1);
    }
    return ready;
  }

  try {
    const result = await upstashCommand(["LPOP", QUEUE_KEY, batchSize]);
    const rawItems = Array.isArray(result) ? result : result ? [result] : [];
    const parsed = rawItems
      .map(safeParseEvent)
      .filter((item): item is QueueEvent => Boolean(item));

    const ready: QueueEvent[] = [];
    for (const event of parsed) {
      if (isReady(event)) {
        ready.push(event);
      } else {
        await upstashCommand(["RPUSH", QUEUE_KEY, JSON.stringify(event)]);
      }
    }
    return ready;
  } catch (error) {
    console.warn("[EventQueue] dequeue error:", error);
    return [];
  }
}

export async function ackEvent(_eventId: string): Promise<void> {
  void _eventId;
  // LPOP removes item from queue; explicit ack is currently no-op.
}

export async function retryEvent(id: string, event: QueueEvent, delaySeconds = 30): Promise<void> {
  const next: QueueEvent = {
    ...event,
    id,
    attempts: (event.attempts || 0) + 1,
    availableAt: new Date(Date.now() + Math.max(1, delaySeconds) * 1000).toISOString(),
  };

  if (!hasUpstash) {
    if (next.attempts >= 5) {
      return;
    }
    inMemoryQueue.push(next);
    return;
  }

  if (next.attempts >= 5) {
    await upstashCommand(["RPUSH", DLQ_KEY, JSON.stringify(next)]);
    return;
  }

  await upstashCommand(["RPUSH", QUEUE_KEY, JSON.stringify(next)]);
}
