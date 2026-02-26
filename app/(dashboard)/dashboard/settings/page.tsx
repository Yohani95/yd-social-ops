"use client";

import { useSearchParams } from "next/navigation";
import { SettingsClient } from "@/components/dashboard/settings-client";
import { useDashboard } from "@/components/dashboard/dashboard-context";

export default function SettingsPage() {
  const { tenant, userRole } = useDashboard();
  const searchParams = useSearchParams();

  return (
    <SettingsClient
      tenant={tenant}
      userRole={userRole}
      mpSuccess={searchParams.get("mp_success") === "true"}
      mpError={searchParams.get("mp_error") || undefined}
      gmailSuccess={searchParams.get("gmail_success") === "true"}
      gmailError={searchParams.get("gmail_error") || undefined}
    />
  );
}
