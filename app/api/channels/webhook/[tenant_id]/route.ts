import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { notifyOwnerOnFirstExternalMessage } from "@/lib/owner-alerts";
import type { BotRequest, ChatChannel } from "@/types";

/**
 * POST /api/channels/webhook/:tenant_id
 *
 * Webhook genérico para recibir mensajes de canales externos.
 * Servicios como Twilio, MessageBird o integraciones custom
 * envían mensajes a esta URL.
 *
 * Body: { channel, sender_id, message, metadata?, webhook_secret? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  try {
    const { tenant_id } = await params;
    const body = await request.json();
    const { channel, sender_id, message, webhook_secret } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "El campo 'message' es requerido" },
        { status: 400 }
      );
    }
    if (!channel) {
      return NextResponse.json(
        { error: "El campo 'channel' es requerido" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: channelConfig } = await supabase
      .from("social_channels")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("channel_type", channel)
      .eq("is_active", true)
      .single();

    if (!channelConfig) {
      return NextResponse.json(
        { error: `Canal '${channel}' no configurado o inactivo para este tenant` },
        { status: 404 }
      );
    }

    const storedSecret = channelConfig.config?.webhook_secret;
    if (storedSecret && storedSecret !== webhook_secret) {
      return NextResponse.json({ error: "webhook_secret inválido" }, { status: 401 });
    }

    const rateLimit = checkAIRateLimit(tenant_id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados mensajes. Intenta en un momento.", retry_after_seconds: rateLimit.retryAfterSeconds },
        { status: 429 }
      );
    }

    const channelType = channel as ChatChannel;
    if (sender_id && channelType !== "web") {
      await notifyOwnerOnFirstExternalMessage({
        tenantId: tenant_id,
        channel: channelType,
        senderId: String(sender_id),
        message: message.trim(),
      });
    }

    const botRequest: BotRequest = {
      tenant_id,
      user_message: message.trim(),
      session_id: `${channel}_${sender_id || "unknown"}`,
      user_identifier: sender_id || undefined,
      channel: channelType,
    };

    const response = await processMessage(botRequest);

    return NextResponse.json({
      success: true,
      ...response,
    });
  } catch (error) {
    console.error("[Channel Webhook] Error:", error);
    return NextResponse.json(
      { error: "Error procesando el mensaje" },
      { status: 500 }
    );
  }
}
