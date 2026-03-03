import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";

type ArchiveDataset = "chat_logs" | "conversation_messages";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface ArchiveResult {
  archived_rows: number;
  archived_files: number;
  deleted_rows: number;
}

async function deleteByAgeBatched(params: {
  supabase: ServiceClient;
  table: string;
  dateColumn: string;
  cutoffIso: string;
  batchSize?: number;
}) {
  const batchSize = Math.min(Math.max(params.batchSize || 1000, 100), 5000);
  let deleted = 0;

  while (true) {
    const { data: rows, error: selectError } = await params.supabase
      .from(params.table)
      .select("id")
      .lt(params.dateColumn, params.cutoffIso)
      .limit(batchSize);

    if (selectError) {
      throw new Error(selectError.message);
    }

    const ids = (rows || []).map((row) => row.id as string);
    if (!ids.length) break;

    const { error: deleteError } = await params.supabase
      .from(params.table)
      .delete()
      .in("id", ids);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    deleted += ids.length;
    if (ids.length < batchSize) break;
  }

  return deleted;
}

async function ensureArchiveBucket(supabase: ServiceClient, bucket: string) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`archive_bucket_list_failed: ${listError.message}`);
  }

  const exists = (buckets || []).some((item) => item.name === bucket);
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: "50MB",
  });

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw new Error(`archive_bucket_create_failed: ${createError.message}`);
  }
}

function buildArchivePath(params: {
  dataset: ArchiveDataset;
  tenantId: string;
  fromDate: string;
  rowsCount: number;
}) {
  const day = params.fromDate.slice(0, 10);
  const safeTenant = params.tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const stamp = Date.now();
  return `${params.dataset}/${safeTenant}/${day}/${stamp}-${params.rowsCount}.jsonl`;
}

function groupRowsByTenant(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const tenantId = String(row.tenant_id || "");
    if (!tenantId) continue;

    const current = grouped.get(tenantId) || [];
    current.push(row);
    grouped.set(tenantId, current);
  }

  return grouped;
}

async function archiveAndDeleteByAgeBatched(params: {
  supabase: ServiceClient;
  table: "chat_logs" | "conversation_messages";
  dataset: ArchiveDataset;
  dateColumn: string;
  cutoffIso: string;
  archiveBucket: string;
  batchSize?: number;
}): Promise<ArchiveResult> {
  const batchSize = Math.min(Math.max(params.batchSize || 1000, 100), 5000);
  const result: ArchiveResult = {
    archived_rows: 0,
    archived_files: 0,
    deleted_rows: 0,
  };

  while (true) {
    const { data: rows, error: selectError } = await params.supabase
      .from(params.table)
      .select("*")
      .lt(params.dateColumn, params.cutoffIso)
      .order(params.dateColumn, { ascending: true })
      .limit(batchSize);

    if (selectError) {
      throw new Error(`archive_select_failed_${params.table}: ${selectError.message}`);
    }

    const selectedRows = (rows || []) as Record<string, unknown>[];
    if (!selectedRows.length) break;

    const grouped = groupRowsByTenant(selectedRows);

    for (const [tenantId, tenantRows] of grouped.entries()) {
      const ordered = [...tenantRows].sort((a, b) => {
        const av = String(a.created_at || "");
        const bv = String(b.created_at || "");
        return av.localeCompare(bv);
      });

      const fromDate = String(ordered[0]?.created_at || new Date().toISOString());
      const toDate = String(ordered[ordered.length - 1]?.created_at || fromDate);
      const jsonl = `${ordered.map((row) => JSON.stringify(row)).join("\n")}\n`;
      const checksum = createHash("sha256").update(jsonl).digest("hex");
      const filePath = buildArchivePath({
        dataset: params.dataset,
        tenantId,
        fromDate,
        rowsCount: ordered.length,
      });

      const { error: uploadError } = await params.supabase.storage
        .from(params.archiveBucket)
        .upload(filePath, jsonl, {
          contentType: "application/x-ndjson",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`archive_upload_failed_${params.table}: ${uploadError.message}`);
      }

      const { error: manifestError } = await params.supabase
        .from("data_archives")
        .insert({
          tenant_id: tenantId,
          dataset: params.dataset,
          from_date: fromDate,
          to_date: toDate,
          file_path: filePath,
          rows_count: ordered.length,
          checksum,
        });

      if (manifestError) {
        throw new Error(`archive_manifest_failed_${params.table}: ${manifestError.message}`);
      }

      result.archived_files += 1;
      result.archived_rows += ordered.length;
    }

    const ids = selectedRows.map((row) => String(row.id));
    const { error: deleteError } = await params.supabase
      .from(params.table)
      .delete()
      .in("id", ids);

    if (deleteError) {
      throw new Error(`archive_delete_failed_${params.table}: ${deleteError.message}`);
    }

    result.deleted_rows += ids.length;

    if (selectedRows.length < batchSize) break;
  }

  return result;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();

    const paymentEventsRetentionDays = Number(process.env.PAYMENT_EVENTS_RETENTION_DAYS || "90");
    const chatLogsRetentionDays = Number(process.env.CHAT_LOGS_RETENTION_DAYS || "90");
    const inboxMessagesRetentionDays = Number(process.env.INBOX_MESSAGES_RETENTION_DAYS || "180");
    const inboxThreadsRetentionDays = Number(process.env.INBOX_THREADS_RETENTION_DAYS || "365");
    const archiveBucket = process.env.ARCHIVE_BUCKET || "yd-archives";

    const paymentEventsCutoff = new Date(Date.now() - paymentEventsRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const chatLogsCutoff = new Date(Date.now() - chatLogsRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const inboxMessagesCutoff = new Date(Date.now() - inboxMessagesRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const inboxThreadsCutoff = new Date(Date.now() - inboxThreadsRetentionDays * 24 * 60 * 60 * 1000).toISOString();

    await ensureArchiveBucket(supabase, archiveBucket);

    const { data: expiredMemory, error: expiredMemoryError } = await supabase
      .from("conversation_memory")
      .select("id")
      .lt("expires_at", nowIso);

    if (expiredMemoryError) {
      return NextResponse.json({ error: expiredMemoryError.message }, { status: 500 });
    }

    let deletedMemory = 0;
    if ((expiredMemory || []).length > 0) {
      const ids = expiredMemory!.map((row) => row.id);
      const { error: deleteError } = await supabase
        .from("conversation_memory")
        .delete()
        .in("id", ids);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
      deletedMemory = ids.length;
    }

    const deletedPaymentEvents = await deleteByAgeBatched({
      supabase,
      table: "payment_events",
      dateColumn: "created_at",
      cutoffIso: paymentEventsCutoff,
      batchSize: 1000,
    });

    const archivedChatLogs = await archiveAndDeleteByAgeBatched({
      supabase,
      table: "chat_logs",
      dataset: "chat_logs",
      dateColumn: "created_at",
      cutoffIso: chatLogsCutoff,
      archiveBucket,
      batchSize: 1000,
    });

    const archivedInboxMessages = await archiveAndDeleteByAgeBatched({
      supabase,
      table: "conversation_messages",
      dataset: "conversation_messages",
      dateColumn: "created_at",
      cutoffIso: inboxMessagesCutoff,
      archiveBucket,
      batchSize: 1000,
    });

    const { data: staleThreads, error: staleThreadsError } = await supabase
      .from("conversation_threads")
      .select("id")
      .lt("updated_at", inboxThreadsCutoff)
      .limit(2000);

    if (staleThreadsError) {
      return NextResponse.json({ error: staleThreadsError.message }, { status: 500 });
    }

    let deletedInboxThreads = 0;
    if ((staleThreads || []).length > 0) {
      const threadIds = staleThreads!.map((row) => row.id as string);
      const { data: messageRows, error: messageRowsError } = await supabase
        .from("conversation_messages")
        .select("thread_id")
        .in("thread_id", threadIds);

      if (messageRowsError) {
        return NextResponse.json({ error: messageRowsError.message }, { status: 500 });
      }

      const threadsWithMessages = new Set((messageRows || []).map((row) => row.thread_id as string));
      const emptyThreadIds = threadIds.filter((id) => !threadsWithMessages.has(id));

      if (emptyThreadIds.length > 0) {
        const { error: deleteThreadsError } = await supabase
          .from("conversation_threads")
          .delete()
          .in("id", emptyThreadIds);

        if (deleteThreadsError) {
          return NextResponse.json({ error: deleteThreadsError.message }, { status: 500 });
        }

        deletedInboxThreads = emptyThreadIds.length;
      }
    }

    return NextResponse.json({
      success: true,
      deleted_memory_rows: deletedMemory,
      deleted_payment_events: deletedPaymentEvents,
      deleted_chat_logs: archivedChatLogs.deleted_rows,
      deleted_inbox_messages: archivedInboxMessages.deleted_rows,
      deleted_empty_inbox_threads: deletedInboxThreads,
      archived_chat_logs_rows: archivedChatLogs.archived_rows,
      archived_chat_logs_files: archivedChatLogs.archived_files,
      archived_inbox_rows: archivedInboxMessages.archived_rows,
      archived_inbox_files: archivedInboxMessages.archived_files,
      archive_bucket: archiveBucket,
      retention_days: {
        payment_events: paymentEventsRetentionDays,
        chat_logs: chatLogsRetentionDays,
        inbox_messages: inboxMessagesRetentionDays,
        inbox_threads: inboxThreadsRetentionDays,
      },
    });
  } catch (error) {
    console.error("[Cron cleanup] Error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
