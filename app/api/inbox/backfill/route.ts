import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ChatChannel } from "@/types";

interface LegacyChatLog {
  id: string;
  session_id: string | null;
  user_identifier: string | null;
  user_message: string;
  bot_response: string;
  channel: string | null;
  created_at: string;
}

interface BackfillMessageInsert {
  tenant_id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  author_type: "customer" | "bot";
  content: string;
  provider_message_id: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

const VALID_CHANNELS: ChatChannel[] = ["web", "whatsapp", "messenger", "instagram", "tiktok"];
const BACKFILL_ERROR_CODE = "BACKFILL_FAILED";
const CHUNK_SIZE = 100;

function normalizeChannel(channel: string | null | undefined): ChatChannel {
  if (channel && VALID_CHANNELS.includes(channel as ChatChannel)) {
    return channel as ChatChannel;
  }
  return "web";
}

function normalizeIdentifier(log: LegacyChatLog): string {
  const userIdentifier = (log.user_identifier || "").trim();
  if (userIdentifier) return userIdentifier;

  const sessionId = (log.session_id || "").trim();
  if (sessionId) return `session:${sessionId}`;

  return `legacy:${log.id}`;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown_error";
}

function fail(params: {
  phase: string;
  status?: number;
  message: string;
  details?: Record<string, unknown>;
}) {
  return NextResponse.json(
    {
      success: false,
      error_code: BACKFILL_ERROR_CODE,
      phase: params.phase,
      error: params.message,
      details: params.details || {},
    },
    { status: params.status || 500 }
  );
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (ctx.userRole !== "owner") {
    return NextResponse.json({ error: "Solo owner puede ejecutar backfill" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    max_rows?: number;
    from_date?: string;
    to_date?: string;
  };

  const maxRowsRaw = Number(body.max_rows || 5000);
  const maxRows = Number.isFinite(maxRowsRaw) ? Math.min(Math.max(maxRowsRaw, 1), 50000) : 5000;
  const fromDate = body.from_date?.trim() || null;
  const toDate = body.to_date?.trim() || null;

  const startedAt = Date.now();
  let fetched = 0;
  let upsertedThreads = 0;
  let insertedMessages = 0;
  let skippedMessages = 0;
  let errors = 0;

  const batchSize = 500;
  let offset = 0;

  while (fetched < maxRows) {
    const take = Math.min(batchSize, maxRows - fetched);

    let logsQuery = ctx.supabase
      .from("chat_logs")
      .select("id, session_id, user_identifier, user_message, bot_response, channel, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true })
      .range(offset, offset + take - 1);

    if (fromDate) logsQuery = logsQuery.gte("created_at", fromDate);
    if (toDate) logsQuery = logsQuery.lte("created_at", toDate);

    const { data: logs, error: logsError } = await logsQuery;

    if (logsError) {
      return fail({
        phase: "fetch_logs",
        message: logsError.message,
        details: { tenant_id: ctx.tenantId, offset, take },
      });
    }

    const rows = (logs || []) as LegacyChatLog[];
    if (!rows.length) break;

    try {
      const batchStartedAt = Date.now();
      const threadByKey = new Map<string, { channel: ChatChannel; user_identifier: string; last_message_at: string }>();

      for (const log of rows) {
        const channel = normalizeChannel(log.channel);
        const userIdentifier = normalizeIdentifier(log);
        const key = `${channel}::${userIdentifier}`;
        const current = threadByKey.get(key);
        if (!current || current.last_message_at < log.created_at) {
          threadByKey.set(key, {
            channel,
            user_identifier: userIdentifier,
            last_message_at: log.created_at,
          });
        }
      }

      const threadPayload = Array.from(threadByKey.values()).map((thread) => ({
        tenant_id: ctx.tenantId,
        channel: thread.channel,
        user_identifier: thread.user_identifier,
        status: "open",
        last_message_at: thread.last_message_at,
        unread_count: 0,
        updated_at: new Date().toISOString(),
      }));

      const { data: threadRows, error: threadUpsertError } = await ctx.supabase
        .from("conversation_threads")
        .upsert(threadPayload, { onConflict: "tenant_id,channel,user_identifier" })
        .select("id,channel,user_identifier");

      if (threadUpsertError) {
        return fail({
          phase: "upsert_threads",
          message: threadUpsertError.message,
          details: { tenant_id: ctx.tenantId, thread_candidates: threadPayload.length },
        });
      }

      upsertedThreads += threadPayload.length;

      const threadIdByKey = new Map<string, string>();
      for (const thread of threadRows || []) {
        const threadData = thread as { id: string; channel: string; user_identifier: string };
        threadIdByKey.set(`${threadData.channel}::${threadData.user_identifier}`, threadData.id);
      }

      const candidateMessages: BackfillMessageInsert[] = [];

      for (const log of rows) {
        const channel = normalizeChannel(log.channel);
        const userIdentifier = normalizeIdentifier(log);
        const threadId = threadIdByKey.get(`${channel}::${userIdentifier}`);
        if (!threadId) {
          errors += 1;
          continue;
        }

        const inboundContent = (log.user_message || "").trim();
        if (inboundContent) {
          const providerMessageId = `chat_logs_backfill:${log.id}:inbound`;
          candidateMessages.push({
            tenant_id: ctx.tenantId,
            thread_id: threadId,
            direction: "inbound",
            author_type: "customer",
            content: inboundContent,
            provider_message_id: providerMessageId,
            raw_payload: {
              source: "chat_logs_backfill",
              chat_log_id: log.id,
              role: "customer",
            },
            created_at: log.created_at,
          });
        }

        const outboundContent = (log.bot_response || "").trim();
        if (outboundContent) {
          const providerMessageId = `chat_logs_backfill:${log.id}:outbound`;
          candidateMessages.push({
            tenant_id: ctx.tenantId,
            thread_id: threadId,
            direction: "outbound",
            author_type: "bot",
            content: outboundContent,
            provider_message_id: providerMessageId,
            raw_payload: {
              source: "chat_logs_backfill",
              chat_log_id: log.id,
              role: "bot",
            },
            created_at: log.created_at,
          });
        }
      }

      if (candidateMessages.length > 0) {
        const dedupedByProviderId = new Map<string, BackfillMessageInsert>();
        for (const message of candidateMessages) {
          dedupedByProviderId.set(message.provider_message_id, message);
        }
        const dedupedMessages = Array.from(dedupedByProviderId.values());

        for (let i = 0; i < dedupedMessages.length; i += CHUNK_SIZE) {
          const chunk = dedupedMessages.slice(i, i + CHUNK_SIZE);
          const providerIds = chunk.map((message) => message.provider_message_id);

          const { data: existingRows, error: existingError } = await ctx.supabase
            .from("conversation_messages")
            .select("provider_message_id")
            .eq("tenant_id", ctx.tenantId)
            .in("provider_message_id", providerIds);

          if (existingError) {
            return fail({
              phase: "insert_messages_existing_lookup",
              message: existingError.message,
              details: { tenant_id: ctx.tenantId, chunk_size: chunk.length, offset },
            });
          }

          const existingProviderIds = new Set(
            (existingRows || [])
              .map((row) => (row as { provider_message_id?: string }).provider_message_id)
              .filter((value): value is string => Boolean(value))
          );

          const toInsert = chunk.filter((message) => !existingProviderIds.has(message.provider_message_id));
          skippedMessages += chunk.length - toInsert.length;

          if (toInsert.length > 0) {
            const { error: insertError } = await ctx.supabase
              .from("conversation_messages")
              .insert(toInsert);

            if (insertError) {
              return fail({
                phase: "insert_messages",
                message: insertError.message,
                details: {
                  tenant_id: ctx.tenantId,
                  insert_count: toInsert.length,
                  chunk_size: chunk.length,
                  offset,
                },
              });
            }

            insertedMessages += toInsert.length;
          }
        }
      }

      console.info("[Inbox Backfill] batch_ok", {
        tenant_id: ctx.tenantId,
        batch_rows: rows.length,
        offset,
        duration_ms: Date.now() - batchStartedAt,
      });
    } catch (error) {
      return fail({
        phase: "batch_processing",
        message: normalizeErrorMessage(error),
        details: { tenant_id: ctx.tenantId, offset, batch_rows: rows.length },
      });
    }

    fetched += rows.length;
    offset += rows.length;

    if (rows.length < take) break;
  }

  console.info("[Inbox Backfill] completed", {
    tenant_id: ctx.tenantId,
    processed_logs: fetched,
    upserted_threads: upsertedThreads,
    inserted_messages: insertedMessages,
    skipped_messages: skippedMessages,
    errors,
    duration_ms: Date.now() - startedAt,
  });

  return NextResponse.json({
    success: true,
    data: {
      processed_logs: fetched,
      upserted_threads: upsertedThreads,
      inserted_messages: insertedMessages,
      skipped_messages: skippedMessages,
      errors,
      max_rows: maxRows,
      from_date: fromDate,
      to_date: toDate,
      duration_ms: Date.now() - startedAt,
    },
  });
}
