import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import type { RoutingRule } from "@/types";

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
    moduleName: "routing",
    requiredPlan: "pro",
    requiredFeatureFlag: "routing_enabled",
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { data, error } = await ctx.supabase
    .from("routing_rules")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json({
        success: true,
        data: [],
        setup_required: true,
        readiness_status: "setup_required",
        setup_module: "routing",
        plan_required: "pro",
        migration_file: MIGRATION_FILE,
        message: "Modulo Routing pendiente de migracion DB",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rules = ((data || []) as RoutingRule[]);
  if (rules.length === 0) {
    return NextResponse.json({
      success: true,
      readiness_status: "ready",
      plan_required: "pro",
      data: [],
    });
  }

  const ruleIds = rules.map((rule) => rule.id);
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const { data: routingEvents, error: routingEventsError } = await ctx.supabase
    .from("routing_events")
    .select("rule_id,created_at")
    .eq("tenant_id", ctx.tenantId)
    .in("rule_id", ruleIds)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (routingEventsError && !isSchemaNotReady(routingEventsError)) {
    console.warn("[Routing API] routing_events read warning:", routingEventsError.message);
  }

  const activity = new Map<string, { lastAppliedAt: string | null; applied24h: number }>();
  for (const ruleId of ruleIds) {
    activity.set(ruleId, { lastAppliedAt: null, applied24h: 0 });
  }

  for (const row of ((routingEvents || []) as Array<{ rule_id: string | null; created_at: string }>)) {
    if (!row.rule_id) continue;
    const current = activity.get(row.rule_id) || { lastAppliedAt: null, applied24h: 0 };
    if (!current.lastAppliedAt) current.lastAppliedAt = row.created_at;
    const createdMs = Date.parse(row.created_at);
    if (Number.isFinite(createdMs) && createdMs >= since24h) current.applied24h += 1;
    activity.set(row.rule_id, current);
  }

  const enriched = rules.map((rule) => {
    const metrics = activity.get(rule.id) || { lastAppliedAt: null, applied24h: 0 };
    const healthStatus: RoutingRule["health_status"] =
      !rule.is_active
        ? "inactive"
        : !rule.target_team?.trim()
          ? "requires_setup"
          : "active";
    return {
      ...rule,
      health_status: healthStatus,
      last_applied_at: metrics.lastAppliedAt,
      applied_count_24h: metrics.applied24h,
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
    moduleName: "routing",
    requiredPlan: "pro",
    requiredFeatureFlag: "routing_enabled",
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    priority?: number;
    is_active?: boolean;
    condition?: Record<string, unknown>;
    target_team?: string;
    target_tenant_user_id?: string | null;
  };

  const name = (body.name || "").trim();
  const targetTeam = (body.target_team || "").trim();
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });
  if (!targetTeam) return NextResponse.json({ error: "target_team requerido" }, { status: 400 });

  const payload = {
    id: body.id,
    tenant_id: ctx.tenantId,
    name,
    priority: Number.isFinite(body.priority) ? Number(body.priority) : 100,
    is_active: body.is_active !== false,
    condition: body.condition || {},
    target_team: targetTeam,
    target_tenant_user_id: body.target_tenant_user_id || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("routing_rules")
    .upsert(payload)
    .select("*")
    .single();

  if (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json(
        {
          error: "Routing no disponible aun: falta migracion de base de datos",
          message: "Este modulo aun no esta activado en tu entorno",
          setup_required: true,
          readiness_status: "setup_required",
          setup_module: "routing",
          plan_required: "pro",
          migration_file: MIGRATION_FILE,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, readiness_status: "ready", plan_required: "pro", data });
}
