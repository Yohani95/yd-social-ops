"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";

export interface KnowledgeChunk {
  id: string;
  source: string;
  topic: string;
  content: string;
  confidence: number;
  version: number;
  is_active: boolean;
  created_at: string;
}

export interface KnowledgeFilters {
  source?: string;
  topic?: string;
  active_only?: boolean;
  limit?: number;
}

export async function getKnowledgeChunks(filters: KnowledgeFilters = {}): Promise<KnowledgeChunk[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  let query = ctx.supabase
    .from("bot_knowledge_chunks")
    .select("id, source, topic, content, confidence, version, is_active, created_at")
    .eq("tenant_id", ctx.tenantId);

  if (filters.source) query = query.eq("source", filters.source);
  if (filters.topic) query = query.eq("topic", filters.topic);
  if (filters.active_only !== false) query = query.eq("is_active", true);

  const limit = Math.min(filters.limit ?? 200, 500);
  const { data } = await query.order("created_at", { ascending: false }).limit(limit);

  return (data as KnowledgeChunk[]) || [];
}

export async function deactivateChunk(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { error } = await ctx.supabase
    .from("bot_knowledge_chunks")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
