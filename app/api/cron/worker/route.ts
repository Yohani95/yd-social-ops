import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runMessageWorker } from "@/workers/message-worker";
import { processScheduledCampaigns } from "@/lib/campaigns";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const batchSizeRaw = request.nextUrl.searchParams.get("batch_size");
  const batchSize = batchSizeRaw ? Number(batchSizeRaw) : undefined;
  const runCampaigns = request.nextUrl.searchParams.get("run_campaigns") !== "false";

  const [workerResult, campaignsResult] = await Promise.all([
    runMessageWorker({ batchSize }),
    runCampaigns ? processScheduledCampaigns({ batchSize }) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      worker: workerResult,
      campaigns: campaignsResult,
    },
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
