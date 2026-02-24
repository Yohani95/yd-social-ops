"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown, User, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Tenant } from "@/types";

interface HeaderProps {
  user: SupabaseUser;
  tenant: Tenant | null;
}

export function DashboardHeader({ user, tenant }: HeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function copyBotUrl() {
    if (!tenant?.id) return;
    const url = `${window.location.origin}/api/bot/${tenant.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("URL del bot copiada al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-6 shrink-0">
      {/* Bot URL */}
      {tenant && (
        <button
          onClick={copyBotUrl}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          title="Copiar URL del bot"
        >
          <span className="hidden sm:block font-mono bg-muted px-2 py-1 rounded truncate max-w-xs">
            /api/bot/{tenant.id.slice(0, 8)}...
          </span>
          {copied ? (
            <CheckCheck className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5 group-hover:text-primary" />
          )}
        </button>
      )}

      {/* User Menu */}
      <div className="flex items-center gap-2 ml-auto">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <span className="hidden md:block text-muted-foreground truncate max-w-[160px]">
            {user.email}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
