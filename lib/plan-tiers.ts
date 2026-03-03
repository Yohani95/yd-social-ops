import type { PlanTier } from "@/types";

const PLAN_ORDER: PlanTier[] = [
  "basic",
  "pro",
  "business",
  "enterprise",
  "enterprise_plus",
];

export function getPlanRank(planTier: PlanTier): number {
  return PLAN_ORDER.indexOf(planTier);
}

export function comparePlanTier(current: PlanTier, target: PlanTier): number {
  const currentRank = getPlanRank(current);
  const targetRank = getPlanRank(target);
  return targetRank - currentRank;
}

export function isUpgrade(current: PlanTier, target: PlanTier): boolean {
  return comparePlanTier(current, target) > 0;
}

export function isDowngrade(current: PlanTier, target: PlanTier): boolean {
  return comparePlanTier(current, target) < 0;
}

export function isSamePlan(current: PlanTier, target: PlanTier): boolean {
  return current === target;
}

