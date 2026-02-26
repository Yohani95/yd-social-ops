"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ChatLog } from "@/types";

export interface ChatLogFilters {
  channel?: string;
  intent?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export async function getChatLogs(
  limitOrFilters: number | ChatLogFilters = 50
): Promise<ChatLog[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const filters: ChatLogFilters =
    typeof limitOrFilters === "number"
      ? { limit: limitOrFilters }
      : limitOrFilters;

  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  let query = ctx.supabase
    .from("chat_logs")
    .select("*")
    .eq("tenant_id", ctx.tenantId);

  if (filters.channel && filters.channel !== "all") {
    query = query.eq("channel", filters.channel);
  }

  if (filters.intent && filters.intent !== "all") {
    query = query.eq("intent_detected", filters.intent);
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`user_message.ilike.${term},bot_response.ilike.${term}`);
  }

  const { data } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return (data as ChatLog[]) || [];
}
