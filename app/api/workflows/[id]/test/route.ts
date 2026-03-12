import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import { executeWorkflow } from "@/lib/workflow-engine";
import type { WorkflowContext } from "@/types";

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
  const body = (await request.json().catch(() => ({}))) as {
    context?: Partial<WorkflowContext>;
  };

  const { data: workflow } = await ctx.supabase
    .from("automation_workflows")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!workflow) return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });

  const context: WorkflowContext = {
    tenantId: ctx.tenantId,
    triggerType: body.context?.triggerType || "message_received",
    channel: body.context?.channel || "web",
    message: body.context?.message || "Mensaje de prueba",
    intentDetected: body.context?.intentDetected || "inquiry",
    paymentStatus: body.context?.paymentStatus || null,
    productInterest: body.context?.productInterest || null,
    contactId: body.context?.contactId || null,
    threadId: body.context?.threadId || null,
    senderId: body.context?.senderId || "test_user",
    contactTags: body.context?.contactTags || [],
    metadata: body.context?.metadata || { source: "workflow_test_api" },
    triggerEventId: body.context?.triggerEventId || null,
  };

  const result = await executeWorkflow(id, context);
  return NextResponse.json({ success: true, data: result });
}
