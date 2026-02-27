import type { SocialChannel, ChatChannel } from "@/types";
import { WhatsAppAdapter } from "./whatsapp";
import { MessengerAdapter } from "./messenger";
import { InstagramAdapter } from "./instagram";
import { TikTokAdapter } from "./tiktok";
import { GenericAdapter } from "./generic";

export interface ParsedMessage {
  senderId: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Media ID para audio (WhatsApp). Se usa para obtener URL desde Meta API. */
  audioMediaId?: string;
  /** URL directa del audio (Messenger/Instagram). Si existe, se usa para transcribir. */
  audioUrl?: string;
}

export interface ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null;
  sendReply(to: string, message: string, config: SocialChannel): Promise<void>;
  formatMessage(message: string): string;
}

const adapters: Record<string, ChannelAdapter> = {
  whatsapp: new WhatsAppAdapter(),
  messenger: new MessengerAdapter(),
  instagram: new InstagramAdapter(),
  tiktok: new TikTokAdapter(),
  web: new GenericAdapter(),
};

export function getAdapter(channel: ChatChannel | string): ChannelAdapter {
  return adapters[channel] || adapters.web;
}
