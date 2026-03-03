import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { listInboxThreads } from "@/lib/inbox";
import type { ChatChannel, ThreadStatus } from "@/types";

const VALID_CHANNELS: ChatChannel[] = ["web", "whatsapp", "messenger", "instagram", "tiktok"];
const VALID_STATUSES: ThreadStatus[] = ["open", "pending", "closed"];

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const channelRaw = searchParams.get("channel");
  const statusRaw = searchParams.get("status");
  const search = searchParams.get("search") || undefined;
  const limit = Number(searchParams.get("limit") || "50");
  const offset = Number(searchParams.get("offset") || "0");

  const channel = channelRaw && VALID_CHANNELS.includes(channelRaw as ChatChannel)
    ? (channelRaw as ChatChannel)
    : undefined;
  const status = statusRaw && VALID_STATUSES.includes(statusRaw as ThreadStatus)
    ? (statusRaw as ThreadStatus)
    : undefined;

  const data = await listInboxThreads({
    tenantId: ctx.tenantId,
    channel,
    status,
    search,
    limit,
    offset,
  });

  return NextResponse.json({ success: true, data: data.threads, pagination: data.pagination });
}
