import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage, SendReplyOptions } from "./index";

/**
 * Facebook Messenger Adapter
 *
 * Usa la misma Graph API de Meta pero con un formato diferente.
 * Los mensajes de Messenger llegan como:
 * entry[].messaging[].sender.id + entry[].messaging[].message.text
 */
export class MessengerAdapter implements ChannelAdapter {
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
        entry?: Array<{
          id?: string;
          messaging?: Array<{
            sender?: { id?: string };
            message?: {
              text?: string;
              mid?: string;
              is_echo?: boolean;
              attachments?: Array<{
                type?: string;
                mime_type?: string;
                payload?: { url?: string; src?: string; mime_type?: string };
              }>;
            };
          }>;
        }>;
      };

      const entry = data?.entry?.[0];
      const events = entry?.messaging || [];

      for (const messaging of events) {
        if (!messaging?.sender?.id) continue;
        const msg = messaging.message;
        if (!msg || msg.is_echo === true) continue;

        if (msg.text) {
          return {
            senderId: messaging.sender.id,
            message: msg.text,
            metadata: {
              page_id: entry?.id,
              message_id: msg.mid,
            },
          };
        }

        const audioUrl = this.extractAudioUrl(msg.attachments);
        if (audioUrl) {
          return {
            senderId: messaging.sender.id,
            message: "",
            metadata: {
              page_id: entry?.id,
              message_id: msg.mid,
            },
            audioUrl,
          };
        }
      }

      return null;
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

    if (!accessToken) {
      const errMessage = "[Messenger] No se puede enviar: falta access_token";
      console.warn(errMessage);
      if (options?.throwOnError) throw new Error(errMessage);
      return;
    }

    const url = "https://graph.facebook.com/v21.0/me/messages";

    const hasImage = options?.mediaType === "image" && typeof options.mediaUrl === "string" && options.mediaUrl.trim().length > 0;
    const bodyToSend = hasImage
      ? {
          recipient: { id: to },
          message: {
            attachment: {
              type: "image",
              payload: {
                url: options.mediaUrl?.trim(),
                is_reusable: false,
              },
            },
          },
          access_token: accessToken,
        }
      : {
          recipient: { id: to },
          message: { text: this.formatMessage(message) },
          access_token: accessToken,
        };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyToSend),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Messenger] Error enviando mensaje:", err);
      if (options?.throwOnError) {
        throw new Error(`[Messenger] ${err}`);
      }
    }

    // Si se envió imagen y también hay texto, enviamos un segundo mensaje de texto.
    if (response.ok && hasImage && message.trim().length > 0) {
      const textResponse = await fetch(url, {
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

      if (!textResponse.ok) {
        const err = await textResponse.text();
        console.error("[Messenger] Error enviando texto tras imagen:", err);
        if (options?.throwOnError) {
          throw new Error(`[Messenger] ${err}`);
        }
      }
    }
  }

  formatMessage(message: string): string {
    if (message.length > 2000) {
      return message.substring(0, 1995) + "...";
    }
    return message;
  }
}
