"use client";

import { useSearchParams } from "next/navigation";
import { PaymentsClient } from "@/components/dashboard/payments-client";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { PlanTier } from "@/types";

const VALID_PLAN_TIERS: PlanTier[] = ["basic", "pro", "business", "enterprise", "enterprise_plus"];

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

export default function PaymentsPage() {
  const { tenant, userRole } = useDashboard();
  const searchParams = useSearchParams();

  const subscribePlanRaw = searchParams.get("subscribe_plan");
  const subscribePlan = VALID_PLAN_TIERS.includes(subscribePlanRaw as PlanTier)
    ? (subscribePlanRaw as PlanTier)
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
    <PaymentsClient
      tenant={tenant}
      userRole={userRole}
      mpSubReturn={mpSubReturn}
      mpPreapprovalId={mpPreapprovalId}
      initialSaasPlan={subscribePlan}
    />
  );
}
