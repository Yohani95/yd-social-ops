import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { processScheduledCampaigns } from "@/lib/campaigns";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenant_id") || undefined;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const batchSizeRaw = request.nextUrl.searchParams.get("batch_size");

  const limit = limitRaw ? Number(limitRaw) : undefined;
  const batchSize = batchSizeRaw ? Number(batchSizeRaw) : undefined;

  const result = await processScheduledCampaigns({
    tenantId,
    limit,
    batchSize,
  });

  return NextResponse.json({ success: true, data: result });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
