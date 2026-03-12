"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function readCollapsedValue(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("yd.sidebar.collapsed") === "true";
  } catch {
    return false;
  }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readCollapsedValue());

  useEffect(() => {
    try {
      window.localStorage.setItem("yd.sidebar.collapsed", String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        collapsed,
        setCollapsed,
        toggleCollapsed: () => setCollapsed((prev) => !prev),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
