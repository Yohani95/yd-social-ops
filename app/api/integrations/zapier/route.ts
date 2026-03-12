import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { enqueueEvent } from "@/lib/event-queue";
import { trackEvent } from "@/lib/conversion-analytics";
import type { ChatChannel } from "@/types";

async function authorize(req: NextRequest) {
  const primary = await authenticateApiRequest(req, "integrations:write");
  if (primary.tenantId) return primary;
  return authenticateApiRequest(req, "messages:write");
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.tenantId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const eventType = typeof body.event_type === "string" ? body.event_type : "message_received";
  const channelRaw = typeof body.channel === "string" ? body.channel : "web";
  const channel: ChatChannel = ["web", "whatsapp", "messenger", "instagram", "tiktok"].includes(channelRaw)
    ? (channelRaw as ChatChannel)
    : "web";

  const queued = await enqueueEvent({
    tenantId: auth.tenantId,
    type: "integration.zapier",
    payload: {
      trigger_type: eventType,
      channel,
      metadata: {
        source: "zapier",
        payload: body,
      },
      allow_ai_fallback: false,
    },
  });

  await trackEvent({
    tenantId: auth.tenantId,
    eventType: "conversation_started",
    channel,
    actorType: "system",
    metadata: {
      source: "zapier",
      queued: queued.ok,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      queued: queued.ok,
      event_id: queued.id || null,
    },
  });
}
