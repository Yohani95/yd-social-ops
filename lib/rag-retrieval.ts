/**
 * RAG Retrieval — Fase 4
 *
 * Búsqueda léxica en bot_knowledge_chunks para enriquecer el system prompt
 * con contexto relevante por tenant/canal/intención.
 *
 * Activado solo cuando feature_flag `rag_enabled` es true.
 */

import { createServiceClient } from "@/lib/supabase/server";
import type { BotKnowledgeChunk } from "@/types";

// ============================================================
// Keyword extraction (simple, no dependencias externas)
// ============================================================

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "de", "la", "el", "en", "y", "a", "un", "por", "con", "que", "es", "se",
    "del", "los", "las", "su", "al", "le", "lo", "para", "son", "hay", "si",
    "no", "me", "te", "mi", "tu", "yo", "the", "is", "in", "it", "of", "to",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .slice(0, 20);
}

function scoreChunk(chunk: BotKnowledgeChunk, keywords: string[]): number {
  const text = `${chunk.topic} ${chunk.content}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) score += 1;
  }
  return score * Number(chunk.confidence ?? 1);
}

// ============================================================
// Main retrieval function
// ============================================================

export async function retrieveContext(
  tenantId: string,
  channel: string,
  _intent: string,
  query: string,
  maxChunks = 5
): Promise<string> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("bot_knowledge_chunks")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("channel", [channel, "all"])
      .order("confidence", { ascending: false })
      .limit(50); // fetch top-50 candidates, then rank client-side

    if (error || !data || data.length === 0) return "";

    const keywords = extractKeywords(query);
    if (keywords.length === 0) return "";

    const scored = (data as BotKnowledgeChunk[])
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, keywords) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks);

    if (scored.length === 0) return "";

    const sections = scored.map(
      ({ chunk }) => `[${chunk.topic || chunk.source}]\n${chunk.content.trim()}`
    );

    return `\nCONTEXTO ADICIONAL (base de conocimiento):\n${sections.join("\n\n")}`;
  } catch (err) {
    console.warn("[RAG] Error en retrieveContext:", err);
    return "";
  }
}
