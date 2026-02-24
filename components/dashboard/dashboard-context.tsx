"use client";

import { createContext, useContext } from "react";
import type { Tenant, UserRole } from "@/types";

interface DashboardContextValue {
  tenant: Tenant | null;
  tenantId: string;
  userRole: UserRole;
  userId: string;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DashboardContextValue;
}) {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
