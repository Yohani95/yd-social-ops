import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import type { WorkflowNodeType } from "@/types";

const VALID_NODE_TYPES: WorkflowNodeType[] = ["trigger", "condition", "action"];

interface NodeInput {
  id?: string;
  node_type: WorkflowNodeType;
  sequence_order: number;
  label: string;
  config: Record<string, unknown>;
}

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
    .from("automation_nodes")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("workflow_id", id)
    .order("sequence_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [] });
}

export async function PUT(
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
  const body = (await request.json().catch(() => ({}))) as { nodes?: NodeInput[] };
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];

  for (const node of nodes) {
    if (!VALID_NODE_TYPES.includes(node.node_type)) {
      return NextResponse.json({ error: "node_type invalido" }, { status: 400 });
    }
    if (!node.label?.trim()) {
      return NextResponse.json({ error: "label requerido" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const prepared = nodes.map((node) => ({
    id: node.id,
    tenant_id: ctx.tenantId,
    workflow_id: id,
    node_type: node.node_type,
    sequence_order: Number(node.sequence_order || 0),
    label: node.label.trim(),
    config: node.config || {},
    updated_at: now,
    created_at: now,
  }));

  const { data: existing } = await ctx.supabase
    .from("automation_nodes")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("workflow_id", id);
  const existingIds = new Set((existing || []).map((r) => r.id));
  const receivedIds = new Set(prepared.map((n) => n.id).filter(Boolean));
  const idsToDelete = Array.from(existingIds).filter((x) => !receivedIds.has(x));

  if (idsToDelete.length > 0) {
    await ctx.supabase
      .from("automation_nodes")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("workflow_id", id)
      .in("id", idsToDelete);
  }

  if (prepared.length > 0) {
    const { error } = await ctx.supabase
      .from("automation_nodes")
      .upsert(prepared);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: refreshed } = await ctx.supabase
    .from("automation_nodes")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("workflow_id", id)
    .order("sequence_order", { ascending: true });

  return NextResponse.json({ success: true, data: refreshed || [] });
}
