import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import { getAdapter } from "@/lib/channel-adapters";
import { notifyOwnerOnFirstExternalMessage } from "@/lib/owner-alerts";
import { ensureContactExists } from "@/lib/contacts";
import {
  getMetaMediaUrl,
  transcribeAudioFromUrl,
} from "@/lib/audio-transcription";
import type { SocialChannel, ChatChannel } from "@/types";
import type { ParsedMessage } from "@/lib/channel-adapters";

/**
 * GET /api/webhooks/meta
 *
 * Meta webhook verification.
 * Meta sends a GET with hub.mode, hub.verify_token, hub.challenge.
 * We return the challenge if the verify token matches.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.info("[Meta Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST /api/webhooks/meta
 *
 * Unified webhook for WhatsApp and Messenger.
 * Meta sends both through the same endpoint, differentiated by:
 * - WhatsApp: entry[].changes[].value.messaging_product === "whatsapp"
 * - Messenger: object "page", entry[].messaging[]
 * - Instagram: object "instagram", entry[].messaging[]
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const objectType = body?.object;

    // Debug log para ver exactamente qué envía Meta
    console.info("[Meta Webhook] Received POST — object:", objectType, "body:", JSON.stringify(body).substring(0, 500));

    if (objectType === "whatsapp_business_account") {
      await handleWhatsApp(body);
    } else if (objectType === "page") {
      await handleMessenger(body);
    } else if (objectType === "instagram") {
      await handleInstagram(body);
    } else {
      console.warn("[Meta Webhook] Unknown object type:", objectType);
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[Meta Webhook] Error:", error);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}

async function handleWhatsApp(body: unknown) {
  const adapter = getAdapter("whatsapp");
  const parsed = adapter.parseIncoming(body);
  if (!parsed) return;

  const phoneNumberId = parsed.metadata?.phone_number_id as string;
  if (!phoneNumberId) return;

  const channel = await findChannelByProviderConfig("whatsapp", "phone_number_id", phoneNumberId);
  if (!channel) {
    console.warn("[Meta Webhook] No channel found — channel_type=whatsapp config_key=phone_number_id config_value=%s (verifica que este ID coincida con el canal conectado en Dashboard > Canales)", phoneNumberId);
    return;
  }

  await processAndReply(channel, "whatsapp", parsed);
}

async function handleMessenger(body: unknown) {
  const adapter = getAdapter("messenger");
  const parsed = adapter.parseIncoming(body);
  if (!parsed) return;

  const pageId = parsed.metadata?.page_id as string;
  if (!pageId) return;

  const channel = await findChannelByProviderConfig("messenger", "page_id", pageId);
  if (!channel) {
    console.warn("[Meta Webhook] No channel found — channel_type=messenger config_key=page_id config_value=%s (verifica que este ID coincida con el canal conectado en Dashboard > Canales)", pageId);
    return;
  }

  await processAndReply(channel, "messenger", parsed);
}

async function handleInstagram(body: unknown) {
  const adapter = getAdapter("instagram");
  const parsed = adapter.parseIncoming(body);
  if (!parsed) {
    console.warn("[Meta Webhook] Instagram: no se pudo parsear el mensaje entrante");
    return;
  }

  const igAccountId = parsed.metadata?.ig_account_id as string;
  if (!igAccountId) {
    console.warn("[Meta Webhook] Instagram: falta ig_account_id en metadata");
    return;
  }

  console.info("[Meta Webhook] Instagram: buscando canal con ig_account_id =", igAccountId);

  // Intenta buscar por ig_account_id primero
  let channel = await findChannelByProviderConfig("instagram", "ig_account_id", igAccountId);

  // Fallback: buscar por page_id (a veces Meta envía el page_id en entry.id)
  if (!channel) {
    console.info("[Meta Webhook] Instagram: no encontrado por ig_account_id, intentando por page_id");
    channel = await findChannelByProviderConfig("instagram", "page_id", igAccountId);
  }

  if (!channel) {
    console.warn("[Meta Webhook] No channel found — channel_type=instagram ig_account_id=%s (verifica que este ID coincida con el canal conectado en Dashboard > Canales)", igAccountId);
    return;
  }

  await processAndReply(channel, "instagram", parsed);
}

async function findChannelByProviderConfig(
  channelType: string,
  configKey: string,
  configValue: string
): Promise<SocialChannel | null> {
  const supabase = createServiceClient();

  const { data: channels } = await supabase
    .from("social_channels")
    .select("*")
    .eq("channel_type", channelType)
    .eq("is_active", true);

  if (!channels) return null;

  return (channels as SocialChannel[]).find(
    (ch) => ch.provider_config?.[configKey] === configValue
  ) || null;
}

async function processAndReply(
  channel: SocialChannel,
  channelType: ChatChannel,
  parsed: ParsedMessage
) {
  const { senderId } = parsed;
  let message = parsed.message;

  if (!message && (parsed.audioMediaId || parsed.audioUrl)) {
    try {
      let audioUrl: string | null = null;
      if (parsed.audioMediaId && channel.access_token) {
        audioUrl = await getMetaMediaUrl(parsed.audioMediaId, channel.access_token as string);
      } else if (parsed.audioUrl) {
        audioUrl = parsed.audioUrl;
      }
      if (audioUrl) {
        message = await transcribeAudioFromUrl(audioUrl);
      }
    } catch (err) {
      console.warn("[Meta Webhook] Error transcribiendo audio:", err);
    }
    if (!message) {
      message = "[Mensaje de voz no transcrito]";
    }
  }

  if (!message && !parsed.audioMediaId && !parsed.audioUrl) return;

  await ensureContactExists({
    tenantId: channel.tenant_id,
    channel: channelType,
    identifier: senderId,
  });

  await notifyOwnerOnFirstExternalMessage({
    tenantId: channel.tenant_id,
    channel: channelType,
    senderId,
    message: message || "",
  });

  const adapter = getAdapter(channelType);

  const rateLimit = checkAIRateLimit(channel.tenant_id);
  if (!rateLimit.allowed) {
    await adapter.sendReply(
      senderId,
      "Estamos recibiendo muchos mensajes. Intenta nuevamente en un momento.",
      channel
    );
    return;
  }

  const response = await processMessage({
    tenant_id: channel.tenant_id,
    user_message: message || "",
    session_id: `${channelType}_${senderId}`,
    user_identifier: senderId,
    channel: channelType,
  });

  const formattedMessage = adapter.formatMessage(response.message);
  await adapter.sendReply(senderId, formattedMessage, channel);
}
