"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface DashboardRouteTransitionProps {
  children: ReactNode;
}

export function DashboardRouteTransition({ children }: DashboardRouteTransitionProps) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1 motion-safe:duration-200 motion-safe:ease-out motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}
