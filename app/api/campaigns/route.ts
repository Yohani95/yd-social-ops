import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import type { ChatChannel } from "@/types";

const VALID_CHANNELS: ChatChannel[] = ["web", "whatsapp", "messenger", "instagram", "tiktok"];
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

function normalizeChannels(input: unknown): ChatChannel[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => String(x).trim().toLowerCase())
    .filter((x): x is ChatChannel => VALID_CHANNELS.includes(x as ChatChannel));
}

export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const access = await checkModuleAccess({
    tenantId: ctx.tenantId,
    tenantPlanTier: ctx.tenantPlanTier,
    moduleName: "campaigns",
    requiredPlan: "pro",
    requiredFeatureFlag: "campaigns_enabled",
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { data, error } = await ctx.supabase
    .from("campaigns")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json({
        success: true,
        data: [],
        setup_required: true,
        readiness_status: "setup_required",
        setup_module: "campaigns",
        plan_required: "pro",
        migration_file: MIGRATION_FILE,
        message: "Modulo Campanas pendiente de migracion DB",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    readiness_status: "ready",
    plan_required: "pro",
    data: data || [],
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
    moduleName: "campaigns",
    requiredPlan: "pro",
    requiredFeatureFlag: "campaigns_enabled",
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    message_template?: string;
    channels?: ChatChannel[];
    filters?: Record<string, unknown>;
    scheduled_at?: string | null;
  };

  const name = (body.name || "").trim();
  const messageTemplate = (body.message_template || "").trim();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!messageTemplate) return NextResponse.json({ error: "message_template requerido" }, { status: 400 });

  const channels = normalizeChannels(body.channels);
  if (channels.length === 0) {
    return NextResponse.json({ error: "Debe seleccionar al menos un canal" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("campaigns")
    .insert({
      tenant_id: ctx.tenantId,
      name,
      message_template: messageTemplate,
      channels,
      filters: body.filters || {},
      status: body.scheduled_at ? "scheduled" : "draft",
      scheduled_at: body.scheduled_at || null,
      run_status: body.scheduled_at ? "queued" : "idle",
      next_run_at: body.scheduled_at || null,
      created_by_user_id: ctx.userId,
    })
    .select("*")
    .single();

  if (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json(
        {
          error: "Campanas no disponible aun: falta migracion de base de datos",
          message: "Este modulo aun no esta activado en tu entorno",
          setup_required: true,
          readiness_status: "setup_required",
          setup_module: "campaigns",
          plan_required: "pro",
          migration_file: MIGRATION_FILE,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      success: true,
      readiness_status: "ready",
      plan_required: "pro",
      data,
    },
    { status: 201 }
  );
}
