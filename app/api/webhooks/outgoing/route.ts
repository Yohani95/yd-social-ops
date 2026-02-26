import { NextRequest, NextResponse } from "next/server";
import { notifyN8n } from "@/lib/integrations/n8n";

/**
 * POST /api/webhooks/outgoing
 *
 * Publica eventos salientes del sistema (opcional) hacia n8n.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = typeof body?.event === "string" ? body.event : "unknown";
    const tenantId =
      typeof body?.tenant_id === "string"
        ? body.tenant_id
        : typeof body?.payload?.tenant_id === "string"
          ? body.payload.tenant_id
          : undefined;

    await notifyN8n(event, {
      source: "api/webhooks/outgoing",
      payload: body?.payload ?? body,
    }, { tenantId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Outgoing Webhook] Error:", error);
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
}
