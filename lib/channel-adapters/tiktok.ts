import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage, SendReplyOptions } from "./index";

/**
 * TikTok for Business Adapter
 *
 * TikTok DM webhooks son más restrictivos.
 * El formato exacto depende de la aprobación de la app.
 *
 * Formato esperado del webhook:
 * { event: "receive_message", user_open_id, content: { text } }
 */
export class TikTokAdapter implements ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null {
    try {
      const data = body as {
        event?: string;
        user_open_id?: string;
        content?: {
          text?: string;
          message_type?: string;
        };
      };

      if (data?.event !== "receive_message") return null;
      if (!data.content?.text || !data.user_open_id) return null;

      return {
        senderId: data.user_open_id,
        message: data.content.text,
        metadata: {
          event: data.event,
          message_type: data.content.message_type,
        },
      };
    } catch {
      return null;
    }
  }

  async sendReply(
    to: string,
    message: string,
    config: SocialChannel,
    options?: SendReplyOptions
  ): Promise<void> {
    const accessToken = config.access_token;
    const openId = config.provider_config?.open_id as string;

    if (!accessToken || !openId) {
      const errMessage = "[TikTok] No se puede enviar: falta access_token o open_id";
      console.warn(errMessage);
      if (options?.throwOnError) throw new Error(errMessage);
      return;
    }

    const url = "https://open.tiktokapis.com/v2/dm/message/send/";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: to,
        message_type: "text",
        text: { text: this.formatMessage(message) },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[TikTok] Error enviando DM:", err);
      if (options?.throwOnError) {
        throw new Error(`[TikTok] ${err}`);
      }
    }
  }

  formatMessage(message: string): string {
    if (message.length > 1000) {
      return message.substring(0, 995) + "...";
    }
    return message;
  }
}
