import { isFeatureEnabled, type FeatureFlag } from "@/lib/feature-flags";
import type { PlanTier } from "@/types";

const PLAN_RANK: Record<PlanTier, number> = {
  basic: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
  enterprise_plus: 4,
};

function normalizePlanTier(value: unknown): PlanTier {
  const plan = String(value || "").toLowerCase();
  if (plan === "pro" || plan === "business" || plan === "enterprise" || plan === "enterprise_plus") {
    return plan;
  }
  return "basic";
}

function hasRequiredPlan(currentPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}

function moduleLabel(moduleName: "workflows" | "campaigns" | "routing"): string {
  if (moduleName === "workflows") return "Workflows";
  if (moduleName === "campaigns") return "Campanas";
  return "Routing";
}

export async function checkModuleAccess(params: {
  tenantId: string;
  tenantPlanTier: unknown;
  moduleName: "workflows" | "campaigns" | "routing";
  requiredPlan?: PlanTier;
  requiredFeatureFlag?: FeatureFlag;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      body: {
        error: string;
        setup_required: true;
        setup_module: "workflows" | "campaigns" | "routing";
        readiness_status: "setup_required" | "plan_upgrade_required";
        plan_required: PlanTier;
        message: string;
      };
    }
> {
  const requiredPlan = params.requiredPlan || "pro";
  const currentPlan = normalizePlanTier(params.tenantPlanTier);
  const label = moduleLabel(params.moduleName);

  if (!hasRequiredPlan(currentPlan, requiredPlan)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: `${label} requiere plan ${requiredPlan}`,
        setup_required: true,
        setup_module: params.moduleName,
        readiness_status: "plan_upgrade_required",
        plan_required: requiredPlan,
        message: `Tu plan actual (${currentPlan}) no incluye ${label}. Actualiza a ${requiredPlan} o superior.`,
      },
    };
  }

  if (params.requiredFeatureFlag) {
    const enabled = await isFeatureEnabled(params.tenantId, params.requiredFeatureFlag);
    if (!enabled) {
      return {
        ok: false,
        status: 409,
        body: {
          error: `${label} requiere configuracion adicional`,
          setup_required: true,
          setup_module: params.moduleName,
          readiness_status: "setup_required",
          plan_required: requiredPlan,
          message: `${label} aun no esta habilitado para este tenant. Activa la configuracion del modulo.`,
        },
      };
    }
  }

  return { ok: true };
}
