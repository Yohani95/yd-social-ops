import { createServiceClient } from "@/lib/supabase/server";
import type {
  ChatChannel,
  ConversationMessage,
  ConversationThread,
  MessageAuthorType,
  MessageDirection,
  OffsetPagination,
  SocialChannel,
  ThreadStatus,
} from "@/types";

type ThreadRow = ConversationThread;
type MessageRow = ConversationMessage;

interface PaginatedThreadsResult {
  threads: ThreadRow[];
  pagination: OffsetPagination;
}

interface PaginatedMessagesResult {
  messages: MessageRow[];
  pagination: OffsetPagination;
}

function normalizeText(input: string): string {
  return input.trim().slice(0, 12000);
}

async function findContactId(params: {
  tenantId: string;
  channel: ChatChannel;
  userIdentifier: string;
}): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("contacts")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("channel", params.channel)
    .eq("identifier", params.userIdentifier)
    .maybeSingle();

  return data?.id || null;
}

async function ensureThread(params: {
  tenantId: string;
  channel: ChatChannel;
  userIdentifier: string;
  unreadDelta?: number;
  status?: ThreadStatus;
  resetUnread?: boolean;
}): Promise<ThreadRow | null> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const contactId = await findContactId({
    tenantId: params.tenantId,
    channel: params.channel,
    userIdentifier: params.userIdentifier,
  });
  const unreadDelta = params.unreadDelta ?? 0;

  const { data: existing } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("channel", params.channel)
    .eq("user_identifier", params.userIdentifier)
    .maybeSingle();

  if (existing) {
    const nextUnread = params.resetUnread
      ? 0
      : Math.max(0, Number(existing.unread_count || 0) + unreadDelta);
    const { data: updated } = await supabase
      .from("conversation_threads")
      .update({
        contact_id: contactId || existing.contact_id || null,
        status: params.status || existing.status,
        last_message_at: now,
        unread_count: nextUnread,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("tenant_id", params.tenantId)
      .select("*")
      .single();

    return (updated as ThreadRow) || (existing as ThreadRow);
  }

  const { data: inserted } = await supabase
    .from("conversation_threads")
    .insert({
      tenant_id: params.tenantId,
      channel: params.channel,
      user_identifier: params.userIdentifier,
      contact_id: contactId,
      status: params.status || "open",
      last_message_at: now,
      unread_count: params.resetUnread ? 0 : Math.max(0, unreadDelta),
    })
    .select("*")
    .single();

  return (inserted as ThreadRow) || null;
}

export async function recordInboundThreadMessage(params: {
  tenantId: string;
  channel: ChatChannel;
  userIdentifier: string;
  content: string;
  providerMessageId?: string | null;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const content = normalizeText(params.content);
  if (!content) return;

  const thread = await ensureThread({
    tenantId: params.tenantId,
    channel: params.channel,
    userIdentifier: params.userIdentifier,
    unreadDelta: 1,
    status: "open",
  });
  if (!thread) return;

  const supabase = createServiceClient();
  await supabase.from("conversation_messages").insert({
    thread_id: thread.id,
    tenant_id: params.tenantId,
    direction: "inbound" as MessageDirection,
    author_type: "customer" as MessageAuthorType,
    content,
    provider_message_id: params.providerMessageId || null,
    raw_payload: params.rawPayload || {},
  });
}

export async function recordOutboundThreadMessage(params: {
  tenantId: string;
  channel: ChatChannel;
  userIdentifier: string;
  content: string;
  authorType: "bot" | "agent";
  providerMessageId?: string | null;
  rawPayload?: Record<string, unknown>;
  resetUnread?: boolean;
}): Promise<void> {
  const content = normalizeText(params.content);
  if (!content) return;

  const thread = await ensureThread({
    tenantId: params.tenantId,
    channel: params.channel,
    userIdentifier: params.userIdentifier,
    unreadDelta: 0,
    resetUnread: params.resetUnread,
  });
  if (!thread) return;

  const supabase = createServiceClient();
  await supabase.from("conversation_messages").insert({
    thread_id: thread.id,
    tenant_id: params.tenantId,
    direction: "outbound" as MessageDirection,
    author_type: params.authorType,
    content,
    provider_message_id: params.providerMessageId || null,
    raw_payload: params.rawPayload || {},
  });
}

export async function listInboxThreads(params: {
  tenantId: string;
  channel?: ChatChannel;
  status?: ThreadStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedThreadsResult> {
  const supabase = createServiceClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);
  const offset = Math.max(params.offset || 0, 0);
  let query = supabase
    .from("conversation_threads")
    .select("*")
    .eq("tenant_id", params.tenantId);

  if (params.channel) {
    query = query.eq("channel", params.channel);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.search?.trim()) {
    const term = `%${params.search.trim()}%`;
    query = query.or(`user_identifier.ilike.${term}`);
  }

  const { data } = await query
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit);

  const rows = (data as ThreadRow[]) || [];
  const hasMore = rows.length > limit;
  const threads = hasMore ? rows.slice(0, limit) : rows;

  return {
    threads,
    pagination: {
      limit,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
    },
  };
}

export async function getInboxThreadById(params: {
  tenantId: string;
  threadId: string;
}): Promise<ThreadRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("id", params.threadId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  return (data as ThreadRow) || null;
}

export async function getInboxThreadMessages(params: {
  tenantId: string;
  threadId: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedMessagesResult> {
  const supabase = createServiceClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);
  const offset = Math.max(params.offset || 0, 0);

  const { data } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  const rowsDesc = (data as MessageRow[]) || [];
  const hasMore = rowsDesc.length > limit;
  const sliced = hasMore ? rowsDesc.slice(0, limit) : rowsDesc;
  const messages = sliced.reverse();

  return {
    messages,
    pagination: {
      limit,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
    },
  };
}

export async function updateInboxThreadStatus(params: {
  tenantId: string;
  threadId: string;
  status: ThreadStatus;
}): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("conversation_threads")
    .update({
      status: params.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId)
    .eq("tenant_id", params.tenantId);

  return !error;
}

export async function markInboxThreadRead(params: {
  tenantId: string;
  threadId: string;
}): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("conversation_threads")
    .update({
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId)
    .eq("tenant_id", params.tenantId);

  return !error;
}

export async function getActiveChannelConfig(params: {
  tenantId: string;
  channel: ChatChannel;
}): Promise<SocialChannel | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("social_channels")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("channel_type", params.channel)
    .eq("is_active", true)
    .maybeSingle();

  return (data as SocialChannel) || null;
}
