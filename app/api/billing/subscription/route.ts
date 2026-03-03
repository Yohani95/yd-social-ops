import { NextResponse } from "next/server";
import { createServiceClient, getAuthenticatedContext } from "@/lib/supabase/server";

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
  console.error("[Billing Subscription] db_query_failed", {
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

export async function GET() {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: subscription, error: subscriptionError } = await supabase
      .from("saas_subscriptions")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (subscriptionError) {
      return respondDbQueryFailed({
        phase: "load_subscription",
        tenantId: ctx.tenantId,
        error: subscriptionError,
      });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, email, plan_tier, saas_subscription_status, saas_subscription_id, trial_ends_at, saas_trial_consumed_at, saas_trial_consumed_plan_tier, pending_plan_tier, pending_plan_effective_at, pending_plan_requested_at, pending_plan_source, mp_user_id, mp_connected_at, merchant_checkout_mode, merchant_external_checkout_url, merchant_ad_hoc_link_mode, merchant_ad_hoc_max_amount_clp, merchant_ad_hoc_expiry_minutes")
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

    const { data: lastEvent, error: lastEventError } = await supabase
      .from("saas_billing_events")
      .select("event_topic, processed_at, created_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("processed", true)
      .neq("event_topic", "checkout_attempt")
      .order("processed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastEventError) {
      return respondDbQueryFailed({
        phase: "load_last_event",
        tenantId: ctx.tenantId,
        error: lastEventError,
      });
    }

    const { data: recentEvents, error: recentEventsError } = await supabase
      .from("saas_billing_events")
      .select("id, event_topic, event_resource_id, processed, processed_at, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (recentEventsError) {
      return respondDbQueryFailed({
        phase: "load_recent_events",
        tenantId: ctx.tenantId,
        error: recentEventsError,
      });
    }

    const lastSyncAt =
      (typeof lastEvent?.processed_at === "string" && lastEvent.processed_at) ||
      (typeof subscription?.updated_at === "string" && subscription.updated_at) ||
      null;
    const lastSyncSource =
      typeof lastEvent?.event_topic === "string"
        ? (lastEvent.event_topic === "reconcile_manual" ? "reconcile" : "webhook")
        : null;

    return NextResponse.json({
      success: true,
      data: {
        tenant,
        subscription,
        recent_events: recentEvents || [],
        last_sync_at: lastSyncAt,
        last_sync_source: lastSyncSource,
      },
    });
  } catch (error) {
    console.error("[Billing Subscription] Error:", error);
    return NextResponse.json({ error: "No se pudo obtener el estado de suscripción" }, { status: 500 });
  }
}
