"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  Package,
  Settings,
  MessageSquare,
  Users,
  Share2,
  Crown,
  ChevronRight,
  Zap,
  Play,
  Wand2,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import type { Tenant } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  requiredPlan?: "pro" | "enterprise";
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Setup", href: "/dashboard/setup", icon: Wand2, badge: "Nuevo" },
  { label: "Productos", href: "/dashboard/products", icon: Package },
  { label: "Chat Logs", href: "/dashboard/chat-logs", icon: MessageSquare },
  { label: "Contactos", href: "/dashboard/contacts", icon: Users },
  {
    label: "Equipo",
    href: "/dashboard/team",
    icon: Users,
    badge: "Enterprise",
    requiredPlan: "enterprise",
  },
  {
    label: "Canales",
    href: "/dashboard/channels",
    icon: Share2,
  },
  {
    label: "Probar Bot",
    href: "/dashboard/channels/simulator",
    icon: Play,
  },
  { label: "Configuración", href: "/dashboard/settings", icon: Settings },
  {
    label: "API Keys",
    href: "/dashboard/settings/api-keys",
    icon: Settings, // using settings icon or could use KeyRound if imported
    badge: "Enterprise",
    requiredPlan: "enterprise",
  },
  {
    label: "MCP Servers",
    href: "/dashboard/settings/mcp",
    icon: Server, // need to import Server from lucide-react
    badge: "Enterprise+",
    requiredPlan: "enterprise",
  },
  {
    label: "Marca Propia",
    href: "/dashboard/settings/branding",
    icon: Wand2,
    badge: "Enterprise+",
    requiredPlan: "enterprise",
  },
];

const planConfig = {
  basic: { label: "Plan Básico", color: "secondary" as const, icon: Bot },
  pro: { label: "Plan Pro", color: "default" as const, icon: Zap },
  business: { label: "Plan Business", color: "default" as const, icon: Zap },
  enterprise: { label: "Enterprise", color: "success" as const, icon: Crown },
  enterprise_plus: { label: "Enterprise+", color: "success" as const, icon: Crown },
};

interface SidebarContentProps {
  tenant: Tenant | null;
  userRole?: string;
  onNavigate?: () => void;
}

function SidebarContent({ tenant, userRole, onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const plan = (tenant?.plan_tier as keyof typeof planConfig) || "basic";
  const planInfo = planConfig[plan] || planConfig.basic;
  const PlanIcon = planInfo.icon;

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-5 border-b border-sidebar-border">
        {tenant?.white_label_logo ? (
          <img src={tenant.white_label_logo} alt="Logo" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-sidebar-foreground truncate">
            {tenant?.white_label_name || "YD Social Ops"}
          </p>
          <p className="text-xs text-sidebar-foreground/60 truncate">
            {tenant?.business_name || "Mi Negocio"}
          </p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(item.href) &&
              !navItems.some(
                (other) =>
                  other.href !== item.href &&
                  other.href.startsWith(item.href) &&
                  pathname.startsWith(other.href)
              ));

          const isLocked =
            item.requiredPlan &&
            plan !== item.requiredPlan &&
            !(item.requiredPlan === "pro" && plan === "enterprise");

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={isLocked ? "/dashboard/settings" : item.href}
              prefetch={false}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors group relative min-h-[44px]",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isLocked && "opacity-60 cursor-pointer"
              )}
              title={isLocked ? `Requiere ${item.badge}` : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && !isActive && (
                <Badge
                  variant={isLocked ? "outline" : "secondary"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {item.badge}
                </Badge>
              )}
              {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Plan Badge */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent">
          <PlanIcon className="w-4 h-4 text-sidebar-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
              {planInfo.label}
            </p>
            <p className="text-xs text-sidebar-foreground/50 truncate">
              {tenant?.saas_subscription_status === "active"
                ? "Activo"
                : tenant?.saas_subscription_status === "trial"
                  ? "Período de prueba"
                  : "Inactivo"}
            </p>
          </div>
          {plan !== "enterprise" && (
            <Link
              href="/pricing"
              onClick={onNavigate}
              className="text-xs text-sidebar-primary hover:underline shrink-0"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

interface SidebarProps {
  tenant: Tenant | null;
  userRole?: string;
}

export function DashboardSidebar({ tenant, userRole }: SidebarProps) {
  const { open, setOpen } = useSidebar();

  return (
    <>
      {/* Desktop: sidebar fijo */}
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar border-r border-sidebar-border shrink-0 h-full">
        <SidebarContent tenant={tenant} userRole={userRole} />
      </aside>

      {/* Mobile: Sheet drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[min(280px,calc(100vw-2rem))] p-0 flex flex-col bg-sidebar border-sidebar-border [&>button]:text-sidebar-foreground [&>button]:hover:text-sidebar-foreground [&>button]:right-4 [&>button]:top-4"
          showCloseButton={true}
        >
          <VisuallyHidden>
            <SheetTitle>Menú de navegación</SheetTitle>
          </VisuallyHidden>
          <SidebarContent
            tenant={tenant}
            userRole={userRole}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
