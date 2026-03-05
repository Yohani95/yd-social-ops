import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ChannelAutomationRule } from "@/types";

/**
 * GET /api/channels/:id/automation-rules
 * Lista las reglas de automatización del canal (filtra por tenant).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  // Verifica que el canal pertenece al tenant
  const { data: channel, error: chErr } = await ctx.supabase
    .from("social_channels")
    .select("id, channel_type, tenant_id")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (chErr || !channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  const { data, error } = await ctx.supabase
    .from("channel_automation_rules")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("channel", channel.channel_type)
    .order("priority", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

/**
 * PUT /api/channels/:id/automation-rules
 * Reemplazo transaccional de reglas del canal.
 * Body: { rules: Partial<ChannelAutomationRule>[] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const { data: channel, error: chErr } = await ctx.supabase
    .from("social_channels")
    .select("id, channel_type, tenant_id")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (chErr || !channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  let body: { rules: Partial<ChannelAutomationRule>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.rules)) {
    return NextResponse.json({ success: false, error: "Se requiere 'rules' como array" }, { status: 400 });
  }

  const validEventTypes = ["dm", "comment", "mention", "story_reply"];
  const errors: string[] = [];

  for (const rule of body.rules) {
    if (!rule.event_type || !validEventTypes.includes(rule.event_type)) {
      errors.push(`event_type inválido: ${rule.event_type}`);
    }
    if (rule.confidence_threshold !== undefined) {
      const v = Number(rule.confidence_threshold);
      if (v < 0 || v > 1) errors.push(`confidence_threshold fuera de rango (0-1)`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, error: errors.join("; ") }, { status: 422 });
  }

  // Upsert rules por event_type
  const upsertPayload = body.rules.map((rule) => ({
    tenant_id: ctx.tenantId,
    channel: channel.channel_type,
    event_type: rule.event_type!,
    is_active: rule.is_active ?? false,
    allowed_actions: rule.allowed_actions ?? ["auto_reply"],
    confidence_threshold: rule.confidence_threshold ?? 0.7,
    quiet_hours_policy: rule.quiet_hours_policy ?? null,
    safety_policy_ref: rule.safety_policy_ref ?? null,
    priority: rule.priority ?? 0,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await ctx.supabase
    .from("channel_automation_rules")
    .upsert(upsertPayload, { onConflict: "tenant_id,channel,event_type" })
    .select();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
