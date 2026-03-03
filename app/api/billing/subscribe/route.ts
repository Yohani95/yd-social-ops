import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getAuthenticatedContext } from "@/lib/supabase/server";
import { normalizeBaseUrl } from "@/lib/app-url";
import {
  createSaaSPreapproval,
  extractPlanTier,
  getSaaSSubscribeMode,
  getSaaSPlanCheckoutLink,
  getSaaSPreapprovalPlanId,
  verifySaaSPlanOwnership,
} from "@/lib/saas-billing";
import { sendCustomTenantEmail } from "@/lib/email";
import { isDowngrade, isSamePlan, isUpgrade } from "@/lib/plan-tiers";
import type { PlanTier } from "@/types";

interface SupabaseQueryError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function sanitizeSupabaseError(error: SupabaseQueryError) {
  return {
    code: error?.code || null,
    message: error?.message || "unknown_error",
    details: error?.details || null,
    hint: error?.hint || null,
  };
}

function respondDbQueryFailed(params: {
  phase: string;
  tenantId?: string | null;
  error: SupabaseQueryError;
}) {
  const supabaseError = sanitizeSupabaseError(params.error);
  console.error("[Billing Subscribe] db_query_failed", {
    tenant_id: params.tenantId || null,
    phase: params.phase,
    error_code: "db_query_failed",
    supabase_error: supabaseError,
  });
  return NextResponse.json(
    {
      error: "No se pudo consultar la base de datos.",
      error_code: "db_query_failed",
      phase: params.phase,
      details: supabaseError,
    },
    { status: 500 }
  );
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "localhost") return false;
    if (url.hostname.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

function resolveBackBaseUrl(): string | null {
  const candidates = [
    process.env.MP_SAAS_BACK_URL_BASE,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NGROK_URL,
  ];

  for (const raw of candidates) {
    const normalized = normalizeBaseUrl(raw || "");
    if (!normalized) continue;
    if (isPublicHttpsUrl(normalized)) return normalized;
  }

  return null;
}

function enrichHostedCheckoutUrl(rawUrl: string, tenantId: string, planTier: PlanTier): string {
  try {
    const url = new URL(rawUrl);
    const backBaseUrl = resolveBackBaseUrl();

    if (!url.searchParams.get("external_reference")) {
      url.searchParams.set("external_reference", tenantId);
    }

    if (backBaseUrl && !url.searchParams.get("back_url")) {
      const backUrl = `${backBaseUrl}/dashboard/settings?tab=payments&subscribe_plan=${encodeURIComponent(planTier)}&mp_sub_return=1`;
      url.searchParams.set("back_url", backUrl);
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeString(value: string | null | undefined): string {
  return (value || "").trim();
}

function hasRealPreapprovalId(value: string | null | undefined): boolean {
  const id = normalizeString(value);
  return Boolean(id) && !id.startsWith("checkout_pending:");
}

function resolveDowngradeEffectiveAt(params: {
  nextBillingDate?: string | null;
  trialEndsAt?: string | null;
}): string {
  const tryParse = (value?: string | null): string | null => {
    if (!value) return null;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toISOString();
  };

  return (
    tryParse(params.nextBillingDate) ||
    tryParse(params.trialEndsAt) ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  );
}

function formatPlanTierLabel(planTier: PlanTier): string {
  if (planTier === "enterprise_plus") return "Enterprise+";
  return planTier.charAt(0).toUpperCase() + planTier.slice(1);
}

async function recordPlanChange(args: {
  supabase: ReturnType<typeof createServiceClient>;
  tenantId: string;
  fromPlanTier: PlanTier;
  toPlanTier: PlanTier;
  changeType: "upgrade" | "downgrade" | "same_plan_blocked";
  status: "requested" | "scheduled" | "applied" | "cancelled" | "failed";
  effectiveAt?: string | null;
  oldPreapprovalId?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    await args.supabase.from("tenant_plan_changes").insert({
      tenant_id: args.tenantId,
      from_plan_tier: args.fromPlanTier,
      to_plan_tier: args.toPlanTier,
      change_type: args.changeType,
      status: args.status,
      effective_at: args.effectiveAt || null,
      mp_old_preapproval_id: args.oldPreapprovalId || null,
      payload: args.payload || {},
    });
  } catch (error) {
    console.warn("[Billing Subscribe] plan_change log failed", {
      tenant_id: args.tenantId,
      from: args.fromPlanTier,
      to: args.toPlanTier,
      change_type: args.changeType,
      status: args.status,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (ctx.userRole !== "owner") {
      return NextResponse.json({ error: "Solo owner puede gestionar suscripcion" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { plan_tier?: string };
    const planTier = extractPlanTier(body.plan_tier) as PlanTier | null;
    if (!planTier) {
      return NextResponse.json({ error: "plan_tier invalido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, email, plan_tier, saas_subscription_status, saas_subscription_id, trial_ends_at, saas_trial_consumed_at, pending_plan_tier, pending_plan_effective_at")
      .eq("id", ctx.tenantId)
      .maybeSingle();

    if (tenantError) {
      return respondDbQueryFailed({
        phase: "load_tenant",
        tenantId: ctx.tenantId,
        error: tenantError,
      });
    }

    if (!tenant?.id) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const currentPlanTier = extractPlanTier(tenant.plan_tier) || "basic";

    const { data: existingSubscription, error: existingSubscriptionError } = await supabase
      .from("saas_subscriptions")
      .select("mp_preapproval_id, status, next_billing_date")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (existingSubscriptionError) {
      return respondDbQueryFailed({
        phase: "load_existing_subscription",
        tenantId: tenant.id,
        error: existingSubscriptionError,
      });
    }

    const oldPreapprovalId = hasRealPreapprovalId(tenant.saas_subscription_id)
      ? tenant.saas_subscription_id
      : hasRealPreapprovalId(existingSubscription?.mp_preapproval_id)
        ? existingSubscription?.mp_preapproval_id
        : null;

    const tenantStatus = String(tenant.saas_subscription_status || "inactive").toLowerCase();
    const activeOrTrial = tenantStatus === "active" || tenantStatus === "trial";

    if (isSamePlan(currentPlanTier, planTier) && activeOrTrial) {
      await recordPlanChange({
        supabase,
        tenantId: tenant.id,
        fromPlanTier: currentPlanTier,
        toPlanTier: planTier,
        changeType: "same_plan_blocked",
        status: "failed",
        oldPreapprovalId,
        payload: {
          reason: "already_on_plan",
        },
      });

      return NextResponse.json(
        {
          error: "Ya estás suscrito a este plan.",
          error_code: "already_on_plan",
          details: {
            plan_tier: planTier,
            status: tenantStatus,
          },
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const pendingEffectiveAt = (() => {
      if (!tenant.pending_plan_effective_at) return null;
      const ms = Date.parse(tenant.pending_plan_effective_at);
      if (Number.isNaN(ms)) return null;
      return new Date(ms).toISOString();
    })();
    const pendingIsDue =
      tenant.pending_plan_tier === planTier &&
      !!pendingEffectiveAt &&
      Date.parse(pendingEffectiveAt) <= Date.now();

    if (isDowngrade(currentPlanTier, planTier) && activeOrTrial && !pendingIsDue) {
      const effectiveAt = resolveDowngradeEffectiveAt({
        nextBillingDate: existingSubscription?.next_billing_date,
        trialEndsAt: tenant.trial_ends_at,
      });

      await supabase
        .from("tenants")
        .update({
          pending_plan_tier: planTier,
          pending_plan_effective_at: effectiveAt,
          pending_plan_requested_at: nowIso,
          pending_plan_source: "owner_request",
          updated_at: nowIso,
        })
        .eq("id", tenant.id);

      await recordPlanChange({
        supabase,
        tenantId: tenant.id,
        fromPlanTier: currentPlanTier,
        toPlanTier: planTier,
        changeType: "downgrade",
        status: "scheduled",
        effectiveAt,
        oldPreapprovalId,
        payload: {
          reason: "scheduled_for_next_cycle",
          requested_at: nowIso,
        },
      });

      if (tenant.email) {
        const fromPlanLabel = formatPlanTierLabel(currentPlanTier);
        const toPlanLabel = formatPlanTierLabel(planTier);
        const effectiveLabel = (() => {
          const ms = Date.parse(effectiveAt);
          if (Number.isNaN(ms)) return effectiveAt;
          return new Date(ms).toLocaleString("es-CL");
        })();

        const emailResult = await sendCustomTenantEmail({
          tenantId: tenant.id,
          to: tenant.email,
          subject: `Cambio de plan programado: ${fromPlanLabel} -> ${toPlanLabel}`,
          message: `Tu cambio de plan quedó programado.\n\nPlan actual: ${fromPlanLabel}\nNuevo plan: ${toPlanLabel}\nFecha efectiva estimada: ${effectiveLabel}\n\nMantendrás tu plan actual hasta esa fecha. Cuando llegue el momento, podrás confirmar el cambio desde Settings > Pagos.`,
        });

        if (!emailResult.ok) {
          console.warn("[Billing Subscribe] scheduled_downgrade email failed", {
            tenant_id: tenant.id,
            from_plan_tier: currentPlanTier,
            to_plan_tier: planTier,
            reason: emailResult.reason || "unknown",
          });
        }
      }

      console.info("[Billing Subscribe] scheduled_downgrade", {
        tenant_id: tenant.id,
        from_plan_tier: currentPlanTier,
        to_plan_tier: planTier,
        effective_at: effectiveAt,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode: "scheduled_downgrade",
          scheduled: true,
          from_plan_tier: currentPlanTier,
          to_plan_tier: planTier,
          effective_at: effectiveAt,
        },
      });
    }

    const trialEligible = !tenant.saas_trial_consumed_at;

    const recordCheckoutAttempt = async (mode: "plan_checkout" | "api_preapproval") => {
      try {
        await supabase.from("saas_billing_events").insert({
          event_topic: "checkout_attempt",
          event_resource_id: `${tenant.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          tenant_id: tenant.id,
          payload: {
            tenant_id: tenant.id,
            tenant_email: tenant.email || null,
            plan_tier: planTier,
            mode,
            trial_eligible: trialEligible,
            current_plan_tier: currentPlanTier,
            pending_due: pendingIsDue,
          },
          processed: true,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("[Billing Subscribe] checkout_attempt log failed", {
          tenant_id: tenant.id,
          plan_tier: planTier,
          mode,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    if (isUpgrade(currentPlanTier, planTier) || pendingIsDue) {
      await recordPlanChange({
        supabase,
        tenantId: tenant.id,
        fromPlanTier: currentPlanTier,
        toPlanTier: planTier,
        changeType: isUpgrade(currentPlanTier, planTier) ? "upgrade" : "downgrade",
        status: "requested",
        effectiveAt: pendingIsDue ? pendingEffectiveAt : null,
        oldPreapprovalId,
        payload: {
          requested_at: nowIso,
          source: pendingIsDue ? "scheduled_confirmation" : "owner_request",
        },
      });

      await supabase
        .from("tenants")
        .update({
          pending_plan_tier: null,
          pending_plan_effective_at: null,
          pending_plan_requested_at: null,
          pending_plan_source: null,
          updated_at: nowIso,
        })
        .eq("id", tenant.id);
    }

    const hostedCheckoutLink = getSaaSPlanCheckoutLink(planTier, { trialEligible });
    const subscribeMode = getSaaSSubscribeMode();
    if (subscribeMode === "plan_checkout" && hostedCheckoutLink) {
      const planId = getSaaSPreapprovalPlanId(planTier, { trialEligible });
      if (planId) {
        const ownership = await verifySaaSPlanOwnership(planId);
        if (!ownership.valid) {
          return NextResponse.json(
            {
              error:
                "El plan de suscripcion no pertenece al mismo seller/token configurado. Alinea MP_ACCESS_TOKEN y MP_PREAPPROVAL_PLAN_*.",
              details: ownership,
            },
            { status: 400 }
          );
        }
      }

      await recordCheckoutAttempt("plan_checkout");
      const checkoutUrl = enrichHostedCheckoutUrl(hostedCheckoutLink, tenant.id, planTier);
      console.info("[Billing Subscribe] checkout_ready", {
        tenant_id: tenant.id,
        plan_tier: planTier,
        mode: "plan_checkout",
        trial_eligible: trialEligible,
      });
      return NextResponse.json({
        success: true,
        data: {
          checkout_url: checkoutUrl,
          mode: "plan_checkout",
          trial_eligible: trialEligible,
        },
      });
    }

    if (!tenant.email) {
      return NextResponse.json({ error: "El tenant no tiene email para suscripcion" }, { status: 400 });
    }

    const fallbackMode =
      subscribeMode === "preapproval_no_plan" || subscribeMode === "plan_checkout"
        ? "preapproval_no_plan"
        : "preapproval_plan";

    const planId = getSaaSPreapprovalPlanId(planTier, { trialEligible });
    if (planId && fallbackMode === "preapproval_plan") {
      const ownership = await verifySaaSPlanOwnership(planId);
      if (!ownership.valid) {
        return NextResponse.json(
          {
            error:
              "El plan de suscripcion no pertenece al mismo seller/token configurado. Alinea MP_ACCESS_TOKEN y MP_PREAPPROVAL_PLAN_*.",
            details: ownership,
          },
          { status: 400 }
        );
      }
    }

    await recordCheckoutAttempt("api_preapproval");
    const preapproval = await createSaaSPreapproval({
      tenantId: tenant.id,
      email: tenant.email,
      planTier,
      mode: fallbackMode,
      trialEligible,
    });

    const preapprovalId = preapproval.id;
    const checkoutUrl = preapproval.init_point || preapproval.sandbox_init_point;
    if (!preapprovalId || !checkoutUrl) {
      return NextResponse.json({ error: "Mercado Pago no devolvio URL de suscripcion" }, { status: 502 });
    }

    console.info("[Billing Subscribe] checkout_ready", {
      tenant_id: tenant.id,
      plan_tier: planTier,
      mode: "api_preapproval",
      trial_eligible: trialEligible,
      preapproval_id: preapprovalId,
    });

    await supabase
      .from("saas_subscriptions")
      .upsert(
        {
          tenant_id: tenant.id,
          mp_preapproval_id: preapprovalId,
          plan_tier: planTier,
          status: (preapproval.status as string) || "pending",
          payer_email: tenant.email,
          external_reference: tenant.id,
          raw_last_payload: preapproval,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

    return NextResponse.json({
      success: true,
      data: {
        checkout_url: checkoutUrl,
        preapproval_id: preapprovalId,
        mode: "api_preapproval",
        trial_eligible: trialEligible,
      },
    });
  } catch (error) {
    console.error("[Billing Subscribe] Error:", error);
    const message = error instanceof Error ? error.message : "No se pudo crear la suscripcion";
    const normalized = message.toLowerCase();

    if (normalized.includes("card_token_id is required")) {
      return NextResponse.json(
        {
          error:
            "Mercado Pago requiere card_token_id cuando se crea preapproval por API con un plan asociado. Usa checkout del plan o integra card token en frontend.",
          details: message,
        },
        { status: 400 }
      );
    }

    if (normalized.includes("mp_sandbox_payer_email")) {
      return NextResponse.json(
        {
          error:
            "Falta MP_SANDBOX_PAYER_EMAIL (email de usuario de prueba comprador en Mercado Pago Sandbox).",
          details: message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}


