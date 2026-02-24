"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ChatLog } from "@/types";

export async function getChatLogs(limit = 50): Promise<ChatLog[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const { data } = await ctx.supabase
    .from("chat_logs")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data as ChatLog[]) || [];
}
