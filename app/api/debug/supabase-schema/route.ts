import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

function getSupabaseRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1] || null;
}

export async function GET() {
  const context = await getAuthenticatedContext();
  if (!context) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (context.userRole !== "owner") {
    return NextResponse.json({ error: "Solo owner" }, { status: 403 });
  }

  const ctx = context;

  const supabaseRef = getSupabaseRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  async function checkTable(table: string) {
    const { error } = await ctx.supabase
      .from(table)
      .select("id")
      .limit(1);

    checks[table] = {
      ok: !error,
      ...(error ? { error: error.message } : {}),
    };
  }

  await Promise.all([
    checkTable("tenants"),
    checkTable("chat_logs"),
    checkTable("conversation_threads"),
    checkTable("conversation_messages"),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      supabase_ref: supabaseRef,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
      tenant_id: ctx.tenantId,
      checks,
    },
  });
}
