import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage, SendReplyOptions } from "./index";

/**
 * Generic Adapter
 *
 * Formato simple para el webhook generico y el web widget.
 * La respuesta se devuelve en el body HTTP, no se envia activamente.
 */
export class GenericAdapter implements ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null {
    try {
      const data = body as {
        sender_id?: string;
        message?: string;
        session_id?: string;
      };

      if (!data?.message) return null;

      return {
        senderId: data.sender_id || "anonymous",
        message: data.message,
        metadata: { session_id: data.session_id },
      };
    } catch {
      return null;
    }
  }

  async sendReply(
    _to: string,
    _message: string,
    _config: SocialChannel,
    _options?: SendReplyOptions
  ): Promise<void> {
    // No-op: la respuesta se devuelve por HTTP en web/generico.
  }

  formatMessage(message: string): string {
    return message;
  }
}
