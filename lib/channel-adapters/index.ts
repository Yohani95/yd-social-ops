import type { SocialChannel, ChatChannel } from "@/types";
import { WhatsAppAdapter } from "./whatsapp";
import { MessengerAdapter } from "./messenger";
import { InstagramAdapter } from "./instagram";
import { TikTokAdapter } from "./tiktok";
import { GenericAdapter } from "./generic";
import { EmailAdapter } from "./email";

export interface ParsedMessage {
  senderId: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Media ID para audio (WhatsApp). Se usa para obtener URL desde Meta API. */
  audioMediaId?: string;
  /** URL directa del audio (Messenger/Instagram). Si existe, se usa para transcribir. */
  audioUrl?: string;
}

export interface SendReplyOptions {
  throwOnError?: boolean;
  mediaUrl?: string;
  mediaType?: "image";
}

export interface ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null;
  sendReply(
    to: string,
    message: string,
    config: SocialChannel,
    options?: SendReplyOptions
  ): Promise<void>;
  formatMessage(message: string): string;
}

const adapters: Record<string, ChannelAdapter> = {
  whatsapp: new WhatsAppAdapter(),
  messenger: new MessengerAdapter(),
  instagram: new InstagramAdapter(),
  tiktok: new TikTokAdapter(),
  email: new EmailAdapter(),
  web: new GenericAdapter(),
};

export function getAdapter(channel: ChatChannel | string): ChannelAdapter {
  return adapters[channel] || adapters.web;
}
