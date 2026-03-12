import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import {
  getCampaignExecutionSummary,
  scheduleCampaign,
  sendCampaignBatch,
} from "@/lib/campaigns";

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
    campaign_id?: string;
    mode?: "now" | "scheduled";
    scheduled_at?: string;
    batch_size?: number;
  };

  if (!body.campaign_id) {
    return NextResponse.json({ error: "campaign_id requerido" }, { status: 400 });
  }

  if (body.mode === "scheduled" && body.scheduled_at) {
    const parsed = Date.parse(body.scheduled_at);
    if (Number.isNaN(parsed)) {
      return NextResponse.json({ error: "scheduled_at invalido" }, { status: 400 });
    }

    const scheduledAt = new Date(parsed).toISOString();
    const scheduled = await scheduleCampaign({
      tenantId: ctx.tenantId,
      campaignId: body.campaign_id,
      scheduledAt,
    });
    if (!scheduled.ok) {
      return NextResponse.json({ error: scheduled.error || "No se pudo programar" }, { status: 500 });
    }

    const summary = await getCampaignExecutionSummary({
      tenantId: ctx.tenantId,
      campaignId: body.campaign_id,
    });

    return NextResponse.json({
      success: true,
      readiness_status: "ready",
      data: {
        scheduled: true,
        scheduled_at: scheduledAt,
        summary,
      },
    });
  }

  const result = await sendCampaignBatch({
    tenantId: ctx.tenantId,
    campaignId: body.campaign_id,
    batchSize: body.batch_size,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "No se pudo enviar campana" }, { status: 500 });
  }
  return NextResponse.json({ success: true, readiness_status: "ready", data: result });
}
