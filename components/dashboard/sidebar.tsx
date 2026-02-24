"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  Package,
  Settings,
  MessageSquare,
  Share2,
  Crown,
  ChevronRight,
  Zap,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  { label: "Productos", href: "/dashboard/products", icon: Package },
  { label: "Chat Logs", href: "/dashboard/chat-logs", icon: MessageSquare },
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
];

const planConfig = {
  basic: { label: "Plan Básico", color: "secondary" as const, icon: Bot },
  pro: { label: "Plan Pro", color: "default" as const, icon: Zap },
  enterprise: { label: "Enterprise", color: "success" as const, icon: Crown },
};

interface SidebarProps {
  tenant: Tenant | null;
  userRole?: string;
}

export function DashboardSidebar({ tenant, userRole }: SidebarProps) {
  const pathname = usePathname();
  const plan = tenant?.plan_tier || "basic";
  const planInfo = planConfig[plan];
  const PlanIcon = planInfo.icon;

  return (
    <aside className="w-64 flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-sidebar-foreground truncate">
            YD Social Ops
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
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

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
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group relative",
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
              className="text-xs text-sidebar-primary hover:underline shrink-0"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
