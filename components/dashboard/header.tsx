"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { HelpBotWidget } from "@/components/dashboard/help-bot-widget";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface HeaderProps {
  user: SupabaseUser;
  tenantId: string;
  planTier: string;
}

export function DashboardHeader({ user, tenantId, planTier }: HeaderProps) {
  const router = useRouter();
  const { setOpen, collapsed, toggleCollapsed } = useSidebar();
  const [loggingOut, setLoggingOut] = useState(false);

  const profileName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    user.email ||
    "Mi cuenta";
  const avatarUrl =
    (typeof user.user_metadata?.avatar_url === "string" && user.user_metadata.avatar_url.trim()) ||
    (typeof user.user_metadata?.picture === "string" && user.user_metadata.picture.trim()) ||
    "";
  const initials =
    profileName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase())
      .join("") || "U";

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-full items-center justify-between gap-2 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] lg:hidden"
          onClick={() => setOpen(true)}
          title="Abrir menu"
          aria-label="Abrir menu de navegacion"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden min-h-[40px] min-w-[40px] lg:inline-flex"
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
          aria-label={collapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <HelpBotWidget tenantId={tenantId} planTier={planTier} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border/70 px-2 py-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Abrir menu de cuenta"
              >
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={`Avatar de ${profileName}`} className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </span>
                <span className="hidden min-w-0 text-left md:block">
                  <span className="block max-w-[180px] truncate text-xs font-medium">{profileName}</span>
                  <span className="block max-w-[180px] truncate text-[11px] text-muted-foreground">{user.email}</span>
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Cuenta</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => router.push("/dashboard/settings?tab=general")}>
                  <UserCircle2 className="h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/dashboard/settings?tab=bot")}>
                  <Settings className="h-4 w-4" />
                  Preferencias
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? "Cerrando sesion..." : "Cerrar sesion"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

