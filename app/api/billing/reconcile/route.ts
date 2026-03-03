import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getAuthenticatedContext } from "@/lib/supabase/server";
import {
  cancelPreapprovalById,
  extractPlanTier,
  fetchLatestPreapprovalByExternalReference,
  fetchLatestPreapprovalByPlanId,
  fetchPreapprovalById,
  getSaaSPreapprovalPlanId,
  normalizeSaaSSubscriptionStatus,
  resolvePlanTierFromPlanId,
} from "@/lib/saas-billing";
import type { PlanTier } from "@/types";

interface ReconcileRequestBody {
  preapproval_id?: string;
  plan_tier?: string;
  force?: boolean;
}

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
  console.error("[Billing Reconcile] db_query_failed", {
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

function parseDateMs(value: string | undefined): number {
  const ms = Date.parse(value || "");
  return Number.isNaN(ms) ? 0 : ms;
}

function normalizePreapprovalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

function normalizeForce(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (ctx.userRole !== "owner") {
      return NextResponse.json({ error: "Solo owner puede sincronizar suscripcion" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ReconcileRequestBody;
    const force = normalizeForce(body.force);
    const requestedPreapprovalId = normalizePreapprovalId(body.preapproval_id);
    const requestedPlanTier = extractPlanTier(body.plan_tier) as PlanTier | null;
    const supabase = createServiceClient();

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, plan_tier, saas_subscription_id, saas_trial_consumed_at, pending_plan_tier, pending_plan_effective_at")
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

    const { data: existingSubscription, error: existingSubscriptionError } = await supabase
      .from("saas_subscriptions")
      .select("mp_preapproval_id")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (existingSubscriptionError) {
      return respondDbQueryFailed({
        phase: "load_existing_subscription",
        tenantId: tenant.id,
        error: existingSubscriptionError,
      });
    }

    const preapprovalId =
      requestedPreapprovalId ||
      (typeof tenant.saas_subscription_id === "string" ? tenant.saas_subscription_id : null) ||
      (typeof existingSubscription?.mp_preapproval_id === "string" ? existingSubscription.mp_preapproval_id : null);

    let preapproval = preapprovalId ? await fetchPreapprovalById(preapprovalId) : null;
    if (!preapproval?.id) {
      preapproval = await fetchLatestPreapprovalByExternalReference(tenant.id);
    }
    if (!preapproval?.id && requestedPlanTier) {
      const expectedPlanIds = [
        getSaaSPreapprovalPlanId(requestedPlanTier),
        getSaaSPreapprovalPlanId(requestedPlanTier, { trialEligible: false }),
      ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

      let latestByPlan: Awaited<ReturnType<typeof fetchLatestPreapprovalByPlanId>> = null;
      for (const expectedPlanId of expectedPlanIds) {
        const candidate = await fetchLatestPreapprovalByPlanId(expectedPlanId);
        if (!candidate?.id) continue;
        if (!latestByPlan || parseDateMs(candidate.date_created) > parseDateMs(latestByPlan.date_created)) {
          latestByPlan = candidate;
        }
      }

      if (latestByPlan?.id && typeof latestByPlan.date_created === "string") {
        const ageMs = Date.now() - parseDateMs(latestByPlan.date_created);
        // Fallback conservador: solo aceptar suscripciones del mismo plan creadas hace <= 2h.
        if (ageMs >= 0 && ageMs <= 2 * 60 * 60 * 1000) {
          preapproval = latestByPlan;
        }
      }
    }

    if (!preapproval?.id) {
      return NextResponse.json(
        {
          error: "No se encontro suscripcion en Mercado Pago para este tenant.",
          details: {
            requested_preapproval_id: requestedPreapprovalId,
            tenant_id: tenant.id,
          },
        },
        { status: 404 }
      );
    }

    const metadata = (preapproval.metadata as Record<string, unknown> | undefined) || {};
    const metadataTenantId = typeof metadata.tenant_id === "string" ? metadata.tenant_id : null;
    const externalRefTenant = typeof preapproval.external_reference === "string" ? preapproval.external_reference : null;
    const resolvedTenantId = metadataTenantId || externalRefTenant;

    if (resolvedTenantId && resolvedTenantId !== tenant.id && !force) {
      return NextResponse.json(
        {
          error: "La suscripcion pertenece a otro tenant segun metadata/external_reference.",
          details: {
            expected_tenant_id: tenant.id,
            resolved_tenant_id: resolvedTenantId,
            preapproval_id: preapproval.id,
          },
        },
        { status: 409 }
      );
    }

    const metadataPlanTier = extractPlanTier(metadata.plan_tier);
    const preapprovalPlanId = typeof preapproval.preapproval_plan_id === "string" ? preapproval.preapproval_plan_id : null;
    const planTier = resolvePlanTierFromPlanId(preapprovalPlanId) ?? metadataPlanTier ?? requestedPlanTier ?? tenant.plan_tier;
    const tenantStatus = normalizeSaaSSubscriptionStatus(preapproval.status);
    const oldPreapprovalId = typeof tenant.saas_subscription_id === "string" ? tenant.saas_subscription_id : null;
    const nextBillingDate = typeof preapproval.auto_recurring?.next_payment_date === "string"
      ? preapproval.auto_recurring.next_payment_date
      : null;
    const startedAt = typeof preapproval.auto_recurring?.start_date === "string"
      ? preapproval.auto_recurring.start_date
      : null;
    const now = new Date().toISOString();

    const tenantUpdate: Record<string, unknown> = {
      saas_subscription_status: tenantStatus,
      saas_subscription_id: String(preapproval.id),
      plan_tier: planTier,
      updated_at: now,
    };
    if (!tenant.saas_trial_consumed_at && (tenantStatus === "trial" || tenantStatus === "active")) {
      tenantUpdate.saas_trial_consumed_at = now;
      tenantUpdate.saas_trial_consumed_plan_tier = planTier;
    }
    if (tenantStatus === "active") {
      tenantUpdate.trial_ends_at = null;
    } else if (tenantStatus === "trial" && nextBillingDate) {
      tenantUpdate.trial_ends_at = nextBillingDate;
    }

    const pendingPlanTier = extractPlanTier(tenant.pending_plan_tier);
    if (pendingPlanTier && pendingPlanTier === planTier && (tenantStatus === "trial" || tenantStatus === "active")) {
      tenantUpdate.pending_plan_tier = null;
      tenantUpdate.pending_plan_effective_at = null;
      tenantUpdate.pending_plan_requested_at = null;
      tenantUpdate.pending_plan_source = null;
    }

    await supabase
      .from("tenants")
      .update(tenantUpdate)
      .eq("id", tenant.id);

    await supabase
      .from("saas_subscriptions")
      .upsert(
        {
          tenant_id: tenant.id,
          mp_preapproval_id: String(preapproval.id),
          plan_tier: planTier,
          status: String(preapproval.status || "pending"),
          payer_email: typeof preapproval.payer_email === "string" ? preapproval.payer_email : null,
          external_reference: externalRefTenant || tenant.id,
          started_at: startedAt,
          next_billing_date: nextBillingDate,
          canceled_at: tenantStatus === "inactive" ? now : null,
          raw_last_payload: preapproval,
          updated_at: now,
        },
        { onConflict: "tenant_id" }
      );

    if (
      oldPreapprovalId &&
      oldPreapprovalId !== String(preapproval.id) &&
      (tenantStatus === "trial" || tenantStatus === "active")
    ) {
      const cancelledOld = await cancelPreapprovalById(oldPreapprovalId);
      if (!cancelledOld) {
        console.warn("[Billing Reconcile] could not cancel previous preapproval", {
          tenant_id: tenant.id,
          old_preapproval_id: oldPreapprovalId,
          new_preapproval_id: String(preapproval.id),
        });
      }
    }

    if (pendingPlanTier && pendingPlanTier === planTier && (tenantStatus === "trial" || tenantStatus === "active")) {
      await supabase
        .from("tenant_plan_changes")
        .update({
          status: "applied",
          mp_new_preapproval_id: String(preapproval.id),
          updated_at: now,
        })
        .eq("tenant_id", tenant.id)
        .eq("to_plan_tier", planTier)
        .eq("status", "scheduled");
    }

    await supabase
      .from("saas_billing_events")
      .insert({
        event_topic: "reconcile_manual",
        event_resource_id: `${String(preapproval.id)}:${Date.now()}`,
        tenant_id: tenant.id,
        payload: {
          requested_preapproval_id: requestedPreapprovalId,
          resolved_tenant_id: resolvedTenantId,
          source: "reconcile",
        },
        processed: true,
        processed_at: now,
        updated_at: now,
      });

    console.info("[Billing Reconcile] synced", {
      tenant_id: tenant.id,
      plan_tier: planTier,
      status: tenantStatus,
      preapproval_id: String(preapproval.id),
      source: "reconcile",
    });

    return NextResponse.json({
      success: true,
      data: {
        status: tenantStatus,
        plan_tier: planTier,
        preapproval_id: String(preapproval.id),
        source: "reconcile",
        last_sync_at: now,
      },
    });
  } catch (error) {
    console.error("[Billing Reconcile] Error:", error);
    const message = error instanceof Error ? error.message : "No se pudo sincronizar suscripcion";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
