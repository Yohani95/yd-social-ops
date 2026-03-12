import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_DOMAIN_TOKENS,
  type DashboardDomain,
} from "@/lib/dashboard-domain";

interface DashboardModuleHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  domain: DashboardDomain;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function DashboardModuleHeader({
  title,
  description,
  icon: Icon,
  domain,
  actions,
  meta,
}: DashboardModuleHeaderProps) {
  const token = DASHBOARD_DOMAIN_TOKENS[domain];

  return (
    <header className={cn("rounded-2xl border p-4 sm:p-5", token.panelClass)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                token.iconWrapClass
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                  {title}
                </h1>
                <Badge variant="outline" className={cn("rounded-full text-[10px]", token.chipClass)}>
                  {token.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

