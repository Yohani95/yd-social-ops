import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage } from "./index";

/**
 * Instagram Messaging API Adapter
 *
 * Meta envía webhooks con object "instagram".
 * Estructura similar a Messenger: entry[].messaging[] con sender.id y message.text.
 * Envío: POST /me/messages con el token (Page/Instagram) igual que Messenger.
 */
export class InstagramAdapter implements ChannelAdapter {
  private extractAudioUrl(
    attachments: Array<{
      type?: string;
      mime_type?: string;
      payload?: { url?: string; src?: string; mime_type?: string };
    }> | undefined
  ): string | null {
    if (!attachments?.length) return null;

    for (const attachment of attachments) {
      const type = (attachment.type || "").toLowerCase();
      const mimeType = (attachment.mime_type || attachment.payload?.mime_type || "").toLowerCase();
      const url = attachment.payload?.url || attachment.payload?.src || "";

      if (!url) continue;

      const isAudioType = type === "audio";
      const isAudioMime = mimeType.startsWith("audio/");
      const isAudioByExtension = /\.(ogg|mp3|wav|m4a|aac|webm)(\?|$)/i.test(url);

      if (isAudioType || isAudioMime || isAudioByExtension) {
        return url;
      }
    }

    return null;
  }

  parseIncoming(body: unknown): ParsedMessage | null {
    try {
      const data = body as {
        object?: string;
        entry?: Array<{
          id?: string;
          messaging?: Array<{
            sender?: { id?: string };
            message?: {
              text?: string;
              mid?: string;
              attachments?: Array<{
                type?: string;
                mime_type?: string;
                payload?: { url?: string; src?: string; mime_type?: string };
              }>;
            };
          }>;
        }>;
      };

      if (data?.object !== "instagram") return null;

      const entry = data?.entry?.[0];
      const messaging = entry?.messaging?.[0];

      if (!messaging?.sender?.id) return null;

      const msg = messaging.message;
      if (msg?.text) {
        return {
          senderId: messaging.sender.id,
          message: msg.text,
          metadata: {
            ig_account_id: entry?.id,
            message_id: msg.mid,
          },
        };
      }

      const audioUrl = this.extractAudioUrl(msg?.attachments);
      if (audioUrl) {
        return {
          senderId: messaging.sender.id,
          message: "",
          metadata: {
            ig_account_id: entry?.id,
            message_id: msg?.mid,
          },
          audioUrl,
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
      console.warn("[Instagram] No se puede enviar: falta access_token");
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
      console.error("[Instagram] Error enviando mensaje:", err);
    }
  }

  formatMessage(message: string): string {
    if (message.length > 2000) {
      return message.substring(0, 1995) + "...";
    }
    return message;
  }
}
