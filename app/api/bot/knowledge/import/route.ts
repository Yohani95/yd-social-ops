import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { KnowledgeSource } from "@/types";

interface KnowledgeChunkInput {
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/bot/knowledge/import
 *
 * Importa bloques de conocimiento para RAG.
 * Body: { source, topic, channel?, chunks: [{content, metadata?}] }
 * Respuesta: { imported, skipped, errors }
 *
 * Versionado: si ya existe mismo tenant+source+topic, incrementa version.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  let body: {
    source: KnowledgeSource;
    topic: string;
    channel?: string;
    chunks: KnowledgeChunkInput[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const { source, topic, channel = "all", chunks } = body;

  const validSources: KnowledgeSource[] = ["products", "faq", "chat_logs", "manual"];
  if (!validSources.includes(source)) {
    return NextResponse.json(
      { success: false, error: `source inválido. Válidos: ${validSources.join(", ")}` },
      { status: 422 }
    );
  }

  if (!topic?.trim()) {
    return NextResponse.json({ success: false, error: "topic es requerido" }, { status: 422 });
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    return NextResponse.json({ success: false, error: "Se requiere al menos un chunk" }, { status: 422 });
  }

  // Obtener versión actual para este source+topic
  const { data: existing } = await ctx.supabase
    .from("bot_knowledge_chunks")
    .select("version")
    .eq("tenant_id", ctx.tenantId)
    .eq("source", source)
    .eq("topic", topic)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  // Desactivar chunks anteriores del mismo source+topic
  if (existing) {
    await ctx.supabase
      .from("bot_knowledge_chunks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId)
      .eq("source", source)
      .eq("topic", topic);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const chunk of chunks) {
    if (!chunk.content?.trim()) {
      skipped++;
      continue;
    }

    const { error } = await ctx.supabase.from("bot_knowledge_chunks").insert({
      tenant_id: ctx.tenantId,
      channel,
      source,
      topic: topic.trim(),
      content: chunk.content.trim(),
      metadata: chunk.metadata ?? {},
      version: nextVersion,
      confidence: 1.0,
      is_active: true,
    });

    if (error) {
      errors.push(error.message);
    } else {
      imported++;
    }
  }

  return NextResponse.json({
    success: true,
    data: { imported, skipped, errors, version: nextVersion },
  });
}
