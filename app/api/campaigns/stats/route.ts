import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import { computeCampaignStats, getCampaignExecutionSummary } from "@/lib/campaigns";

export async function GET(request: NextRequest) {
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

  const campaignId = request.nextUrl.searchParams.get("campaign_id");
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id requerido" }, { status: 400 });
  }

  const stats = await computeCampaignStats({
    tenantId: ctx.tenantId,
    campaignId,
  });

  const summary = await getCampaignExecutionSummary({
    tenantId: ctx.tenantId,
    campaignId,
  });

  return NextResponse.json({
    success: true,
    readiness_status: "ready",
    data: {
      ...stats,
      summary,
    },
  });
}
