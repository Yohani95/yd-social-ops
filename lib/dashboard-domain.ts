import type { ChatChannel } from "@/types";

export type DashboardDomain =
  | "workflows"
  | "channels"
  | "catalog"
  | "inbox"
  | "integrations"
  | "neutral";

export interface DashboardDomainToken {
  label: string;
  panelClass: string;
  chipClass: string;
  iconWrapClass: string;
  navIconClass: string;
  navIconActiveClass: string;
  navActiveClass: string;
  navRailActiveClass: string;
  navIndicatorClass: string;
}

export const DASHBOARD_DOMAIN_TOKENS: Record<DashboardDomain, DashboardDomainToken> = {
  workflows: {
    label: "Workflows",
    panelClass: "border-indigo-500/25 bg-gradient-to-br from-indigo-500/15 via-indigo-500/5 to-background",
    chipClass: "border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    iconWrapClass: "bg-gradient-to-br from-indigo-500 to-indigo-700",
    navIconClass: "text-indigo-200/85 group-hover:text-indigo-100",
    navIconActiveClass: "text-indigo-100",
    navActiveClass: "border-indigo-300/40 bg-indigo-500/28 text-white shadow-[0_10px_24px_rgba(99,102,241,0.35)]",
    navRailActiveClass: "border-indigo-300/40 bg-indigo-500/30 text-white shadow-[0_10px_24px_rgba(99,102,241,0.35)]",
    navIndicatorClass: "bg-indigo-300",
  },
  channels: {
    label: "Canales",
    panelClass: "border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-background",
    chipClass: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    iconWrapClass: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    navIconClass: "text-emerald-200/85 group-hover:text-emerald-100",
    navIconActiveClass: "text-emerald-100",
    navActiveClass: "border-emerald-300/40 bg-emerald-500/28 text-white shadow-[0_10px_24px_rgba(16,185,129,0.35)]",
    navRailActiveClass: "border-emerald-300/40 bg-emerald-500/30 text-white shadow-[0_10px_24px_rgba(16,185,129,0.35)]",
    navIndicatorClass: "bg-emerald-300",
  },
  catalog: {
    label: "Catalogo",
    panelClass: "border-amber-500/25 bg-gradient-to-br from-amber-500/18 via-amber-500/6 to-background",
    chipClass: "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300",
    iconWrapClass: "bg-gradient-to-br from-amber-500 to-amber-700",
    navIconClass: "text-amber-200/85 group-hover:text-amber-100",
    navIconActiveClass: "text-amber-100",
    navActiveClass: "border-amber-300/40 bg-amber-500/28 text-white shadow-[0_10px_24px_rgba(245,158,11,0.35)]",
    navRailActiveClass: "border-amber-300/40 bg-amber-500/30 text-white shadow-[0_10px_24px_rgba(245,158,11,0.35)]",
    navIndicatorClass: "bg-amber-300",
  },
  inbox: {
    label: "Bandeja",
    panelClass: "border-sky-500/25 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-background",
    chipClass: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    iconWrapClass: "bg-gradient-to-br from-sky-500 to-sky-700",
    navIconClass: "text-sky-200/85 group-hover:text-sky-100",
    navIconActiveClass: "text-sky-100",
    navActiveClass: "border-sky-300/40 bg-sky-500/28 text-white shadow-[0_10px_24px_rgba(14,165,233,0.35)]",
    navRailActiveClass: "border-sky-300/40 bg-sky-500/30 text-white shadow-[0_10px_24px_rgba(14,165,233,0.35)]",
    navIndicatorClass: "bg-sky-300",
  },
  integrations: {
    label: "Integraciones",
    panelClass: "border-cyan-500/25 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-background",
    chipClass: "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    iconWrapClass: "bg-gradient-to-br from-cyan-500 to-slate-700",
    navIconClass: "text-cyan-200/85 group-hover:text-cyan-100",
    navIconActiveClass: "text-cyan-100",
    navActiveClass: "border-cyan-300/40 bg-cyan-500/24 text-white shadow-[0_10px_24px_rgba(6,182,212,0.35)]",
    navRailActiveClass: "border-cyan-300/40 bg-cyan-500/26 text-white shadow-[0_10px_24px_rgba(6,182,212,0.35)]",
    navIndicatorClass: "bg-cyan-300",
  },
  neutral: {
    label: "Modulo",
    panelClass: "border-border bg-gradient-to-br from-muted/40 via-muted/10 to-background",
    chipClass: "border-border bg-muted/60 text-muted-foreground",
    iconWrapClass: "bg-gradient-to-br from-slate-500 to-slate-700",
    navIconClass: "text-sidebar-foreground/70 group-hover:text-sidebar-foreground",
    navIconActiveClass: "text-white",
    navActiveClass: "border-sidebar-primary/45 bg-sidebar-primary/30 text-white shadow-[0_10px_24px_rgba(124,58,237,0.35)]",
    navRailActiveClass: "border-sidebar-primary/45 bg-sidebar-primary/30 text-white shadow-[0_10px_24px_rgba(124,58,237,0.35)]",
    navIndicatorClass: "bg-sidebar-primary",
  },
};

const CHANNEL_DOMAIN_BY_TYPE: Partial<Record<ChatChannel, DashboardDomain>> = {
  whatsapp: "channels",
  messenger: "channels",
  instagram: "channels",
  tiktok: "channels",
  web: "channels",
};

export function domainForChannel(channel: ChatChannel): DashboardDomain {
  return CHANNEL_DOMAIN_BY_TYPE[channel] || "neutral";
}

