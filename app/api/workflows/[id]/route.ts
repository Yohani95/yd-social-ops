import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import type { WorkflowTriggerType } from "@/types";

const VALID_TRIGGERS: WorkflowTriggerType[] = [
  "message_received",
  "comment_received",
  "lead_stage_changed",
  "payment_received",
  "scheduled_event",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const access = await checkModuleAccess({
    tenantId: ctx.tenantId,
    tenantPlanTier: ctx.tenantPlanTier,
    moduleName: "workflows",
    requiredPlan: "pro",
    requiredFeatureFlag: "workflow_engine_enabled",
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from("automation_workflows")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const access = await checkModuleAccess({
    tenantId: ctx.tenantId,
    tenantPlanTier: ctx.tenantPlanTier,
    moduleName: "workflows",
    requiredPlan: "pro",
    requiredFeatureFlag: "workflow_engine_enabled",
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    trigger_type?: WorkflowTriggerType;
    is_active?: boolean;
    status?: "draft" | "published" | "archived";
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.trigger_type) {
    if (!VALID_TRIGGERS.includes(body.trigger_type)) {
      return NextResponse.json({ error: "Trigger invalido" }, { status: 400 });
    }
    updates.trigger_type = body.trigger_type;
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.status && ["draft", "published", "archived"].includes(body.status)) updates.status = body.status;

  const { data, error } = await ctx.supabase
    .from("automation_workflows")
    .update(updates)
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
