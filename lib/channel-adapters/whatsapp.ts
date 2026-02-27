import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage } from "./index";

/**
 * WhatsApp Cloud API Adapter
 *
 * Parsea webhooks entrantes de Meta y envia respuestas
 * via la Graph API v21.0.
 *
 * Formato del webhook de Meta para WhatsApp:
 * entry[].changes[].value.messages[] -> mensajes entrantes
 * entry[].changes[].value.metadata.phone_number_id -> identifica el tenant
 */
export class WhatsAppAdapter implements ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null {
    try {
      const data = body as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              messaging_product?: string;
              metadata?: { phone_number_id?: string };
              messages?: Array<{
                from?: string;
                type?: string;
                text?: { body?: string };
                audio?: { id?: string };
              }>;
            };
          }>;
        }>;
      };

      const entry = data?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (value?.messaging_product !== "whatsapp") return null;

      const msg = value?.messages?.[0];
      if (!msg || !msg.from) return null;

      if (msg.type === "text" && msg.text?.body) {
        return {
          senderId: msg.from,
          message: msg.text.body,
          metadata: {
            phone_number_id: value.metadata?.phone_number_id,
          },
        };
      }

      if (msg.type === "audio" && msg.audio?.id) {
        return {
          senderId: msg.from,
          message: "",
          metadata: {
            phone_number_id: value.metadata?.phone_number_id,
          },
          audioMediaId: msg.audio.id,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async sendReply(to: string, message: string, config: SocialChannel): Promise<void> {
    const phoneNumberId = config.provider_config?.phone_number_id as string;
    const accessToken = config.access_token;

    if (!phoneNumberId || !accessToken) {
      console.warn("[WhatsApp] No se puede enviar: falta phone_number_id o access_token");
      return;
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: this.formatMessage(message) },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[WhatsApp] Error enviando mensaje:", err);
    }
  }

  formatMessage(message: string): string {
    if (message.length > 4096) {
      return message.substring(0, 4090) + "...";
    }
    return message;
  }
}
