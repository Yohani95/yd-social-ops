import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";

export async function POST(
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
  const body = (await request.json().catch(() => ({}))) as { is_active?: boolean };
  const now = new Date().toISOString();

  const { data: nodes } = await ctx.supabase
    .from("automation_nodes")
    .select("id, node_type")
    .eq("tenant_id", ctx.tenantId)
    .eq("workflow_id", id);

  const hasAction = (nodes || []).some((n) => n.node_type === "action");
  if (!hasAction) {
    return NextResponse.json(
      { error: "El workflow necesita al menos una accion antes de publicar" },
      { status: 400 }
    );
  }

  const { data, error } = await ctx.supabase
    .from("automation_workflows")
    .update({
      status: "published",
      is_active: body.is_active !== false,
      version: 2,
      updated_at: now,
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
