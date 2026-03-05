import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

/**
 * GET /api/bot/knowledge/list
 * Lista los chunks de conocimiento del tenant autenticado.
 */
export async function GET(_request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data, error } = await ctx.supabase
    .from("bot_knowledge_chunks")
    .select("id, source, topic, content, confidence, version, is_active, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: data ?? [] });
}

/**
 * DELETE /api/bot/knowledge/list?id=<chunk_id>
 * Desactiva un chunk (soft delete via is_active = false).
 */
export async function DELETE(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await ctx.supabase
    .from("bot_knowledge_chunks")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
