"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SettingsClient } from "@/components/dashboard/settings-client";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { getFeatureFlags } from "@/actions/feature-flags";
import type { PlanTier } from "@/types";

const VALID_PLAN_TIERS: PlanTier[] = ["basic", "pro", "business", "enterprise", "enterprise_plus"];
const VALID_TABS = ["general", "integrations", "payments", "enterprise", "bot"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

function parseEmbeddedPreapprovalId(mpSubReturnRaw: string | null): string | undefined {
  if (!mpSubReturnRaw) return undefined;
  const queryIndex = mpSubReturnRaw.indexOf("?");
  if (queryIndex < 0) return undefined;
  const embeddedQuery = mpSubReturnRaw.slice(queryIndex + 1);
  if (!embeddedQuery) return undefined;
  const embeddedParams = new URLSearchParams(embeddedQuery);
  const preapprovalId = embeddedParams.get("preapproval_id");
  return preapprovalId || undefined;
}

export default function SettingsPage() {
  const { tenant, userRole } = useDashboard();
  const searchParams = useSearchParams();
  const [initialFlags, setInitialFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getFeatureFlags().then((r) => {
      if (r.success && r.data) setInitialFlags(r.data);
    });
  }, []);
  const subscribePlanRaw = searchParams.get("subscribe_plan");
  const subscribePlan = VALID_PLAN_TIERS.includes(subscribePlanRaw as PlanTier)
    ? (subscribePlanRaw as PlanTier)
    : undefined;
  const initialTabRaw = searchParams.get("tab") || undefined;
  const initialTab = initialTabRaw && VALID_TABS.includes(initialTabRaw as SettingsTab)
    ? (initialTabRaw as SettingsTab)
    : undefined;
  const mpSubReturnRaw = searchParams.get("mp_sub_return");
  const mpSubReturn = Boolean(
    mpSubReturnRaw &&
    (mpSubReturnRaw === "1" || mpSubReturnRaw.startsWith("1?"))
  );
  const mpPreapprovalId =
    searchParams.get("preapproval_id") ||
    parseEmbeddedPreapprovalId(mpSubReturnRaw);

  return (
    <SettingsClient
      tenant={tenant}
      userRole={userRole}
      mpSuccess={searchParams.get("mp_success") === "true"}
      mpError={searchParams.get("mp_error") || undefined}
      mpSubReturn={mpSubReturn}
      mpPreapprovalId={mpPreapprovalId}
      gmailSuccess={searchParams.get("gmail_success") === "true"}
      gmailError={searchParams.get("gmail_error") || undefined}
      calendlySuccess={searchParams.get("calendly_success") === "true"}
      calendlyError={searchParams.get("calendly_error") || undefined}
      initialSaasPlan={subscribePlan}
      initialTab={initialTab}
      initialFlags={initialFlags}
    />
  );
}
