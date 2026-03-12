"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart2,
  BookOpen,
  Bot,
  ChevronRight,
  Code2,
  CreditCard,
  Crown,
  GitBranch,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  PlugZap,
  Route,
  Server,
  Settings,
  Share2,
  Users,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import {
  DASHBOARD_DOMAIN_TOKENS,
  type DashboardDomain,
} from "@/lib/dashboard-domain";
import type { Tenant } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  requiredPlan?: "pro" | "enterprise";
  domain?: DashboardDomain;
}

interface SidebarContentProps {
  tenant: Tenant | null;
  collapsed: boolean;
  allowCollapse: boolean;
  onNavigate?: () => void;
}

function readSidebarBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw !== "false";
  } catch {
    return fallback;
  }
}

const OPERATION_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, domain: "neutral" },
  { label: "Bandeja omnicanal", href: "/dashboard/inbox", icon: Inbox, domain: "inbox" },
  { label: "Campanas", href: "/dashboard/campaigns", icon: Megaphone, domain: "neutral" },
  { label: "Pagos", href: "/dashboard/payments", icon: CreditCard, domain: "neutral" },
  { label: "Metricas", href: "/dashboard/quality", icon: BarChart2, domain: "neutral" },
];

const CONFIG_ITEMS: NavItem[] = [
  { label: "Workflows", href: "/dashboard/workflows", icon: GitBranch, requiredPlan: "pro", domain: "workflows" },
  { label: "Routing", href: "/dashboard/routing", icon: Route, requiredPlan: "pro", domain: "workflows" },
  { label: "Catalogo", href: "/dashboard/products", icon: Package, domain: "catalog" },
  { label: "Canales", href: "/dashboard/channels", icon: Share2, badge: "Requiere setup", domain: "channels" },
  { label: "Probar bot", href: "/dashboard/channels/simulator", icon: Play, domain: "channels" },
  { label: "Integraciones", href: "/dashboard/settings?tab=integrations", icon: PlugZap, domain: "integrations" },
  { label: "API Docs", href: "/dashboard/api-docs", icon: Code2, domain: "integrations" },
  { label: "Configuracion", href: "/dashboard/settings", icon: Settings, domain: "neutral" },
];

const INSIGHTS_ITEMS: NavItem[] = [
  { label: "Guia 30 min", href: "/dashboard/guide", icon: BookOpen, badge: "Nuevo", domain: "neutral" },
  { label: "Contactos", href: "/dashboard/contacts", icon: Users, domain: "neutral" },
  { label: "Chat Logs", href: "/dashboard/chat-logs", icon: MessageSquare, domain: "neutral" },
  { label: "Base de conocimiento", href: "/dashboard/knowledge", icon: BookOpen, domain: "neutral" },
  { label: "Analitica de conversion", href: "/dashboard/analytics", icon: LineChart, domain: "neutral" },
  { label: "Setup", href: "/dashboard/setup", icon: Wand2, badge: "Requiere setup", domain: "neutral" },
  { label: "Equipo", href: "/dashboard/team", icon: Users, requiredPlan: "enterprise", domain: "neutral" },
  {
    label: "API Keys",
    href: "/dashboard/settings/api-keys",
    icon: KeyRound,
    badge: "Pro/Enterprise",
    requiredPlan: "pro",
    domain: "integrations",
  },
  {
    label: "MCP Servers",
    href: "/dashboard/settings/mcp",
    icon: Server,
    badge: "Enterprise",
    requiredPlan: "enterprise",
    domain: "integrations",
  },
];

const DEV_ONLY_ITEMS: NavItem[] = [
  { label: "QA", href: "/dashboard/qa", icon: Code2, domain: "neutral" },
];

const planConfig = {
  basic: { label: "Plan Basico", color: "secondary" as const, icon: Bot },
  pro: { label: "Plan Pro", color: "default" as const, icon: Bot },
  business: { label: "Plan Business", color: "default" as const, icon: Bot },
  enterprise: { label: "Enterprise", color: "success" as const, icon: Crown },
  enterprise_plus: { label: "Enterprise+", color: "success" as const, icon: Crown },
};

function isLocked(item: NavItem, plan: keyof typeof planConfig): boolean {
  if (!item.requiredPlan) return false;
  if (item.requiredPlan === "pro") {
    return !(plan === "pro" || plan === "enterprise" || plan === "enterprise_plus");
  }
  return !(plan === "enterprise" || plan === "enterprise_plus");
}

function splitHref(href: string): { path: string; params: URLSearchParams } {
  const [path, query] = href.split("?");
  return {
    path: path || "/",
    params: new URLSearchParams(query || ""),
  };
}

function matchScore(pathname: string, searchParams: URLSearchParams, href: string): number {
  const { path, params } = splitHref(href);
  const queryCount = Array.from(params.keys()).length;
  const pathMatches =
    path === "/dashboard"
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`);

  if (!pathMatches) return -1;

  for (const [key, value] of params.entries()) {
    if (searchParams.get(key) !== value) return -1;
  }

  return path.length * 10 + queryCount;
}

function getActiveHref(pathname: string, searchParams: URLSearchParams, items: NavItem[]): string | null {
  let bestHref: string | null = null;
  let bestScore = -1;

  for (const item of items) {
    const score = matchScore(pathname, searchParams, item.href);
    if (score > bestScore) {
      bestScore = score;
      bestHref = item.href;
    }
  }

  return bestHref;
}

function NavList({
  items,
  activeHref,
  plan,
  onNavigate,
  collapsed,
}: {
  items: NavItem[];
  activeHref: string | null;
  plan: keyof typeof planConfig;
  onNavigate?: () => void;
  collapsed: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", collapsed && "space-y-1")}>
      {items.map((item) => {
        const active = item.href === activeHref;
        const locked = isLocked(item, plan);
        const Icon = item.icon;
        const token = DASHBOARD_DOMAIN_TOKENS[item.domain || "neutral"];
        const badgeLabel = locked && item.requiredPlan
          ? item.requiredPlan === "pro"
            ? "Disponible en Pro"
            : "Disponible en Enterprise"
          : item.badge;

        const link = (
          <Link
            key={item.href}
            href={locked ? "/dashboard/settings" : item.href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-h-[44px] items-center rounded-xl border text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              collapsed
                ? "justify-center px-2 py-2"
                : "gap-3 px-3.5 py-2.5",
              active
                ? collapsed
                  ? token.navRailActiveClass
                  : token.navActiveClass
                : "border-transparent text-sidebar-foreground/75 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              locked && "opacity-60"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-opacity",
                collapsed ? "left-0.5" : "left-1.5",
                token.navIndicatorClass,
                active ? "opacity-100" : "opacity-0"
              )}
            />
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? token.navIconActiveClass : token.navIconClass
              )}
            />
            {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
            {!collapsed && badgeLabel && !active ? (
              <Badge variant={locked ? "outline" : "secondary"} className="rounded-full px-2 py-0 text-[10px]">
                {badgeLabel}
              </Badge>
            ) : null}
            {!collapsed && active ? <ChevronRight className="h-3 w-3 shrink-0" /> : null}
          </Link>
        );

        if (!collapsed) return link;

        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">
              {item.label}
              {locked && item.requiredPlan ? ` (${item.requiredPlan === "pro" ? "Pro" : "Enterprise"})` : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SidebarContent({ tenant, collapsed, allowCollapse, onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toggleCollapsed } = useSidebar();
  const plan = ((tenant?.plan_tier as keyof typeof planConfig) || "basic") as keyof typeof planConfig;
  const planInfo = planConfig[plan] || planConfig.basic;
  const PlanIcon = planInfo.icon;
  const [advancedCollapsed, setAdvancedCollapsed] = useState(() =>
    readSidebarBool("yd.sidebar.advanced_collapsed", true)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem("yd.sidebar.advanced_collapsed", String(advancedCollapsed));
    } catch {
      // ignore
    }
  }, [advancedCollapsed]);

  const insightsItems = useMemo(() => {
    const base = [...INSIGHTS_ITEMS];
    if (process.env.NODE_ENV === "development") {
      base.push(...DEV_ONLY_ITEMS);
    }
    return base;
  }, []);

  const allItems = useMemo(
    () => [...OPERATION_ITEMS, ...CONFIG_ITEMS, ...insightsItems],
    [insightsItems]
  );

  const activeHref = useMemo(
    () => getActiveHref(pathname, new URLSearchParams(searchParams.toString()), allItems),
    [allItems, pathname, searchParams]
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("border-b border-sidebar-border", collapsed ? "px-2 py-4" : "px-4 py-5 sm:px-6")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2")}>
          {tenant?.white_label_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.white_label_logo} alt="Logo" className="h-8 w-8 rounded-lg bg-white object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Bot className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
          )}
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-sidebar-foreground">{tenant?.white_label_name || "YD Social Ops"}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{tenant?.business_name || "Mi negocio"}</p>
            </div>
          ) : null}
          {allowCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("text-sidebar-foreground hover:bg-sidebar-accent", collapsed ? "h-8 w-8" : "h-7 w-7")}
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir menu" : "Minimizar menu"}
              aria-label={collapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          ) : null}
        </div>
      </div>

      {collapsed ? (
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <div className="space-y-4">
            <NavList items={OPERATION_ITEMS} activeHref={activeHref} plan={plan} onNavigate={onNavigate} collapsed />
            <div className="border-t border-sidebar-border/70" />
            <NavList items={CONFIG_ITEMS} activeHref={activeHref} plan={plan} onNavigate={onNavigate} collapsed />
            <div className="border-t border-sidebar-border/70" />
            <NavList items={insightsItems} activeHref={activeHref} plan={plan} onNavigate={onNavigate} collapsed />
          </div>
        </nav>
      ) : (
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          <section>
            <div className="mb-2 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">Operacion diaria</p>
              <p className="mt-1 text-[11px] text-sidebar-foreground/45">Mensajes, campanas y conversion.</p>
            </div>
            <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/30 p-2">
              <NavList items={OPERATION_ITEMS} activeHref={activeHref} plan={plan} onNavigate={onNavigate} collapsed={false} />
            </div>
          </section>

          <section>
            <div className="mb-2 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
                Configuracion y automatizacion
              </p>
              <p className="mt-1 text-[11px] text-sidebar-foreground/45">Canales, catalogo, APIs y reglas.</p>
            </div>
            <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/20 p-2">
              <NavList items={CONFIG_ITEMS} activeHref={activeHref} plan={plan} onNavigate={onNavigate} collapsed={false} />
            </div>
          </section>

          <section className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/10 p-2">
            <button
              type="button"
              onClick={() => setAdvancedCollapsed((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/65 hover:bg-sidebar-accent/70"
              aria-expanded={!advancedCollapsed}
            >
              <span>Analitica y soporte tecnico</span>
              <ChevronRight className={cn("h-4 w-4 transition-transform", advancedCollapsed ? "" : "rotate-90")} />
            </button>
            {!advancedCollapsed ? (
              <div className="mt-2 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 p-2">
                <NavList items={insightsItems} activeHref={activeHref} plan={plan} onNavigate={onNavigate} collapsed={false} />
              </div>
            ) : null}
          </section>
        </nav>
      )}

      <div className={cn("border-t border-sidebar-border py-4", collapsed ? "px-2" : "px-3")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-10 items-center justify-center rounded-xl border border-sidebar-border/70 bg-sidebar-accent text-sidebar-foreground">
                <PlanIcon className="h-4 w-4 text-sidebar-primary" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {planInfo.label}
              {" - "}
              {tenant?.saas_subscription_status === "active"
                ? "Activo"
                : tenant?.saas_subscription_status === "trial"
                  ? "Prueba"
                  : "Inactivo"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent px-3 py-2.5">
            <PlanIcon className="h-4 w-4 shrink-0 text-sidebar-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-accent-foreground">{planInfo.label}</p>
              <p className="truncate text-xs text-sidebar-foreground/50">
                {tenant?.saas_subscription_status === "active"
                  ? "Activo"
                  : tenant?.saas_subscription_status === "trial"
                    ? "Prueba"
                    : "Inactivo"}
              </p>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

interface SidebarProps {
  tenant: Tenant | null;
  userRole?: string;
}

export function DashboardSidebar({ tenant }: SidebarProps) {
  const { open, setOpen, collapsed } = useSidebar();

  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[88px]" : "w-72"
        )}
      >
        <SidebarContent tenant={tenant} collapsed={collapsed} allowCollapse onNavigate={undefined} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(320px,calc(100vw-1rem))] flex-col border-sidebar-border bg-sidebar p-0 [&>button]:right-4 [&>button]:top-4 [&>button]:text-sidebar-foreground [&>button]:hover:text-sidebar-foreground"
          showCloseButton
        >
          <VisuallyHidden>
            <SheetTitle>Menu de navegacion</SheetTitle>
          </VisuallyHidden>
          <SidebarContent tenant={tenant} collapsed={false} allowCollapse={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
