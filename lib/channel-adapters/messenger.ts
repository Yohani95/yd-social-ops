import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage } from "./index";

/**
 * Facebook Messenger Adapter
 *
 * Usa la misma Graph API de Meta pero con un formato diferente.
 * Los mensajes de Messenger llegan como:
 * entry[].messaging[].sender.id + entry[].messaging[].message.text
 */
export class MessengerAdapter implements ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null {
    try {
      const data = body as {
        entry?: Array<{
          id?: string;
          messaging?: Array<{
            sender?: { id?: string };
            message?: {
              text?: string;
              mid?: string;
              attachments?: Array<{ type?: string; payload?: { url?: string } }>;
            };
          }>;
        }>;
      };

      const entry = data?.entry?.[0];
      const messaging = entry?.messaging?.[0];

      if (!messaging?.sender?.id) return null;

      const msg = messaging.message;
      if (msg?.text) {
        return {
          senderId: messaging.sender.id,
          message: msg.text,
          metadata: {
            page_id: entry?.id,
            message_id: msg.mid,
          },
        };
      }

      const audioAtt = msg?.attachments?.find((a) => a.type === "audio");
      if (audioAtt?.payload?.url) {
        return {
          senderId: messaging.sender.id,
          message: "",
          metadata: {
            page_id: entry?.id,
            message_id: msg?.mid,
          },
          audioUrl: audioAtt.payload.url,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async sendReply(to: string, message: string, config: SocialChannel): Promise<void> {
    const accessToken = config.access_token;

    if (!accessToken) {
      console.warn("[Messenger] No se puede enviar: falta access_token");
      return;
    }

    const url = "https://graph.facebook.com/v21.0/me/messages";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: to },
        message: { text: this.formatMessage(message) },
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Messenger] Error enviando mensaje:", err);
    }
  }

  formatMessage(message: string): string {
    if (message.length > 2000) {
      return message.substring(0, 1995) + "...";
    }
    return message;
  }
}
