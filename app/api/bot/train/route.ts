import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

/**
 * POST /api/bot/train
 *
 * Acepta texto libre (de ChatGPT u otra fuente externa) y lo importa como knowledge chunks.
 * Divide por \n\n o por --- en línea sola.
 * Body: { source?: string, topic: string, text: string }
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  let body: { source?: string; topic?: string; text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const { text, topic = "general", source = "manual" } = body;

  if (!text?.trim()) {
    return NextResponse.json({ success: false, error: "El campo 'text' es requerido" }, { status: 422 });
  }

  const validSources = ["products", "faq", "chat_logs", "manual"];
  const safeSource = validSources.includes(source) ? source : "manual";

  // Dividir texto en chunks: por "---" en línea sola o por doble salto de línea
  const rawChunks = text
    .split(/\n---\n|\n\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 10);

  if (rawChunks.length === 0) {
    return NextResponse.json({ success: false, error: "No se encontraron chunks válidos en el texto" }, { status: 422 });
  }

  // Obtener versión actual
  const { data: existing } = await ctx.supabase
    .from("bot_knowledge_chunks")
    .select("version")
    .eq("tenant_id", ctx.tenantId)
    .eq("source", safeSource)
    .eq("topic", topic.trim())
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  if (existing) {
    await ctx.supabase
      .from("bot_knowledge_chunks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId)
      .eq("source", safeSource)
      .eq("topic", topic.trim());
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const content of rawChunks) {
    if (!content) { skipped++; continue; }
    const { error } = await ctx.supabase.from("bot_knowledge_chunks").insert({
      tenant_id: ctx.tenantId,
      channel: "all",
      source: safeSource,
      topic: topic.trim(),
      content,
      metadata: { origin: "bot_train_api" },
      version: nextVersion,
      confidence: 0.9,
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
    data: { imported, skipped, errors, version: nextVersion, total_chunks: rawChunks.length },
  });
}
