"use client";

import type { ComponentType } from "react";
import { Globe, type LucideProps } from "lucide-react";
import type { ChatChannel } from "@/types";
import {
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from "@/components/ui/social-icons";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<LucideProps> | ComponentType<{ className?: string; size?: number }>;

interface ChannelVisual {
  label: string;
  ariaLabel: string;
  icon: IconComponent;
  className: string;
}

export const CHANNEL_META: Record<ChatChannel, ChannelVisual> = {
  web: {
    label: "Web",
    ariaLabel: "Canal Web",
    icon: Globe,
    className: "text-slate-600",
  },
  whatsapp: {
    label: "WhatsApp",
    ariaLabel: "Canal WhatsApp",
    icon: WhatsAppIcon,
    className: "text-emerald-600",
  },
  messenger: {
    label: "Messenger",
    ariaLabel: "Canal Messenger",
    icon: MessengerIcon,
    className: "text-blue-600",
  },
  instagram: {
    label: "Instagram",
    ariaLabel: "Canal Instagram",
    icon: InstagramIcon,
    className: "text-rose-500",
  },
  tiktok: {
    label: "TikTok",
    ariaLabel: "Canal TikTok",
    icon: TikTokIcon,
    className: "text-slate-900 dark:text-slate-100",
  },
  email: {
    label: "Email",
    ariaLabel: "Canal Email",
    icon: Mail,
    className: "text-sky-600",
  },
};

export function ChannelInlineList({
  channels,
  className,
}: {
  channels: ChatChannel[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {channels.map((channel) => {
        const meta = CHANNEL_META[channel];
        const Icon = meta.icon;
        return (
          <span
            key={channel}
            className="inline-flex min-h-8 items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
            title={meta.label}
            aria-label={meta.ariaLabel}
          >
            <Icon className={cn("h-3.5 w-3.5", meta.className)} />
            <span>{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ChannelSelectChip({
  channel,
  selected,
  onClick,
  disabled,
}: {
  channel: ChatChannel;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background hover:bg-muted/40",
      )}
    >
      <Icon className={cn("h-4 w-4", meta.className)} />
      <span>{meta.label}</span>
    </button>
  );
}
