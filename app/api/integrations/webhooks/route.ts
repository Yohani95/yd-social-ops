import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await ctx.supabase
    .from("integration_webhooks")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [] });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    target_url?: string;
    secret?: string | null;
    subscribed_events?: string[];
    is_active?: boolean;
  };

  const name = (body.name || "").trim();
  const targetUrl = (body.target_url || "").trim();
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });
  if (!targetUrl) return NextResponse.json({ error: "target_url requerido" }, { status: 400 });

  const payload = {
    id: body.id,
    tenant_id: ctx.tenantId,
    name,
    target_url: targetUrl,
    secret: body.secret || null,
    subscribed_events: Array.isArray(body.subscribed_events) ? body.subscribed_events : [],
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("integration_webhooks")
    .upsert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

