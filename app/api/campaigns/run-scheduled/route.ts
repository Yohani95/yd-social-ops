import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { checkModuleAccess } from "@/lib/module-access";
import { processScheduledCampaigns } from "@/lib/campaigns";

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
    limit?: number;
    batch_size?: number;
  };

  const result = await processScheduledCampaigns({
    tenantId: ctx.tenantId,
    limit: body.limit,
    batchSize: body.batch_size,
  });

  return NextResponse.json({
    success: true,
    readiness_status: "ready",
    data: result,
  });
}
