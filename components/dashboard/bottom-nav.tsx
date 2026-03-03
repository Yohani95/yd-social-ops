"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Package, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

const bottomNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { label: "Productos", href: "/dashboard/products", icon: Package },
  { label: "Canales", href: "/dashboard/channels", icon: Share2 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
      <div className="flex items-center justify-around h-14 pb-[env(safe-area-inset-bottom)]">
        {bottomNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-[64px] transition-colors active:scale-95",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isActive && (
                <div className="absolute top-0 w-8 h-0.5 bg-primary rounded-b-full" />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
