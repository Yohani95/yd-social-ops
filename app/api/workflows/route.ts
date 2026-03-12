import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import type { AutomationWorkflow, WorkflowRunStatus, WorkflowTriggerType } from "@/types";

const VALID_TRIGGERS: WorkflowTriggerType[] = [
  "message_received",
  "comment_received",
  "lead_stage_changed",
  "payment_received",
  "scheduled_event",
];

const MIGRATION_FILE = "supabase/migrations/20260326_competitive_automation_core.sql";

function isSchemaNotReady(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("could not find the table")
  );
}

export async function GET() {
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

  const { data, error } = await ctx.supabase
    .from("automation_workflows")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json({
        success: true,
        data: [],
        setup_required: true,
        readiness_status: "setup_required",
        setup_module: "workflows",
        plan_required: "pro",
        migration_file: MIGRATION_FILE,
        message: "Modulo Workflows pendiente de migracion DB",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workflows = ((data || []) as AutomationWorkflow[]);
  if (workflows.length === 0) {
    return NextResponse.json({
      success: true,
      readiness_status: "ready",
      plan_required: "pro",
      data: [],
    });
  }

  const workflowIds = workflows.map((workflow) => workflow.id);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [nodesRes, latestRunsRes, runs24hRes] = await Promise.all([
    ctx.supabase
      .from("automation_nodes")
      .select("workflow_id,node_type")
      .eq("tenant_id", ctx.tenantId)
      .in("workflow_id", workflowIds),
    ctx.supabase
      .from("automation_runs")
      .select("workflow_id,status,created_at,started_at,completed_at")
      .eq("tenant_id", ctx.tenantId)
      .in("workflow_id", workflowIds)
      .order("created_at", { ascending: false })
      .limit(5000),
    ctx.supabase
      .from("automation_runs")
      .select("workflow_id,status")
      .eq("tenant_id", ctx.tenantId)
      .in("workflow_id", workflowIds)
      .gte("created_at", since24h),
  ]);

  const nodeRows = (nodesRes.data || []) as Array<{ workflow_id: string; node_type: string }>;
  const latestRunRows = (latestRunsRes.data || []) as Array<{
    workflow_id: string;
    status: WorkflowRunStatus;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>;
  const runs24hRows = (runs24hRes.data || []) as Array<{ workflow_id: string; status: WorkflowRunStatus }>;

  const nodeStats = new Map<string, { nodes: number; actions: number }>();
  for (const row of nodeRows) {
    const current = nodeStats.get(row.workflow_id) || { nodes: 0, actions: 0 };
    current.nodes += 1;
    if (row.node_type === "action") current.actions += 1;
    nodeStats.set(row.workflow_id, current);
  }

  const latestByWorkflow = new Map<string, {
    status: WorkflowRunStatus;
    runAt: string | null;
  }>();
  for (const row of latestRunRows) {
    if (latestByWorkflow.has(row.workflow_id)) continue;
    latestByWorkflow.set(row.workflow_id, {
      status: row.status,
      runAt: row.completed_at || row.started_at || row.created_at || null,
    });
  }

  const runs24hByWorkflow = new Map<string, { total: number; failed: number }>();
  for (const row of runs24hRows) {
    const current = runs24hByWorkflow.get(row.workflow_id) || { total: 0, failed: 0 };
    current.total += 1;
    if (row.status === "failed") current.failed += 1;
    runs24hByWorkflow.set(row.workflow_id, current);
  }

  const enriched = workflows.map((workflow) => {
    const stats = nodeStats.get(workflow.id) || { nodes: 0, actions: 0 };
    const latest = latestByWorkflow.get(workflow.id);
    const runs24h = runs24hByWorkflow.get(workflow.id) || { total: 0, failed: 0 };

    const healthStatus: AutomationWorkflow["health_status"] =
      stats.actions === 0
        ? "incomplete"
        : workflow.is_active
          ? "active"
          : "inactive";

    return {
      ...workflow,
      health_status: healthStatus,
      last_run_status: latest?.status || null,
      last_run_at: latest?.runAt || null,
      runs_24h: runs24h.total,
      failed_runs_24h: runs24h.failed,
      nodes_count: stats.nodes,
      actions_count: stats.actions,
    };
  });

  return NextResponse.json({
    success: true,
    readiness_status: "ready",
    plan_required: "pro",
    data: enriched,
  });
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    trigger_type?: WorkflowTriggerType;
    is_active?: boolean;
  };

  const name = (body.name || "").trim();
  const trigger = body.trigger_type;
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return NextResponse.json({ error: "Trigger invalido" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: workflow, error: workflowError } = await ctx.supabase
    .from("automation_workflows")
    .insert({
      tenant_id: ctx.tenantId,
      name,
      description: body.description?.trim() || null,
      trigger_type: trigger,
      status: "draft",
      is_active: body.is_active === true,
      created_by_user_id: ctx.userId,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (workflowError || !workflow) {
    if (isSchemaNotReady(workflowError || undefined)) {
      return NextResponse.json(
        {
          error: "Workflows no disponible aun: falta migracion de base de datos",
          message: "Este modulo aun no esta activado en tu entorno",
          setup_required: true,
          readiness_status: "setup_required",
          setup_module: "workflows",
          plan_required: "pro",
          migration_file: MIGRATION_FILE,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: workflowError?.message || "No se pudo crear workflow" }, { status: 500 });
  }

  const defaultNodes = [
    {
      tenant_id: ctx.tenantId,
      workflow_id: workflow.id,
      node_type: "trigger",
      sequence_order: 0,
      label: "Trigger",
      config: { type: trigger },
      created_at: now,
      updated_at: now,
    },
  ];

  await ctx.supabase.from("automation_nodes").insert(defaultNodes);

  return NextResponse.json(
    {
      success: true,
      readiness_status: "ready",
      plan_required: "pro",
      data: workflow,
    },
    { status: 201 }
  );
}
