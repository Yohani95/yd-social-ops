import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import {
  cancelPreapprovalById,
  extractPlanTier,
  fetchAuthorizedPaymentById,
  fetchPreapprovalById,
  normalizeSaaSSubscriptionStatus,
  resolvePlanTierFromPlanId,
} from "@/lib/saas-billing";
import { sendSaasSubscriptionStatusEmail } from "@/lib/email";

type TenantLookup = {
  id: string;
  email?: string | null;
  business_name?: string | null;
  plan_tier: string;
  saas_subscription_status?: string | null;
  saas_subscription_id?: string | null;
  saas_trial_consumed_at?: string | null;
  pending_plan_tier?: string | null;
  pending_plan_effective_at?: string | null;
};

function parseSignature(signature: string): { ts?: string; v1?: string } {
  const parts = signature.split(",");
  return {
    ts: parts.find((p) => p.startsWith("ts="))?.split("=")[1],
    v1: parts.find((p) => p.startsWith("v1="))?.split("=")[1],
  };
}

function validateMPSignature(params: {
  signatureHeader: string;
  requestId: string;
  dataId: string;
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;

  const parsed = parseSignature(params.signatureHeader);
  if (!parsed.ts || !parsed.v1) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${parsed.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(parsed.v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function getEventTopic(payload: Record<string, unknown>, request: NextRequest): string {
  return String(
    payload.type ||
      payload.topic ||
      payload.action ||
      request.nextUrl.searchParams.get("type") ||
      request.nextUrl.searchParams.get("topic") ||
      ""
  ).toLowerCase();
}

function parseResourcePathId(resource: unknown): string | null {
  if (typeof resource !== "string") return null;
  const trimmed = resource.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function getResourceId(payload: Record<string, unknown>, request: NextRequest): string | null {
  const fromData = (payload.data as { id?: string | number } | undefined)?.id;
  if (fromData) return String(fromData);

  const fromPayloadId = payload.id;
  if (typeof fromPayloadId === "string" || typeof fromPayloadId === "number") {
    return String(fromPayloadId);
  }

  const fromResource = parseResourcePathId(payload.resource);
  if (fromResource) return fromResource;

  const qp = request.nextUrl.searchParams;
  return qp.get("data.id") || qp.get("id");
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "saas-subscription-webhook" });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const topic = getEventTopic(payload, request);
    const resourceId = getResourceId(payload, request);

    if (!topic || !resourceId) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const signatureHeader = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    if (process.env.MP_WEBHOOK_SECRET) {
      if (!signatureHeader || !requestId) {
        console.warn("[SaaS Webhook] missing signature headers topic=%s resource=%s", topic, resourceId);
        return NextResponse.json({ error: "missing_signature" }, { status: 401 });
      }
      const valid = validateMPSignature({
        signatureHeader,
        requestId,
        dataId: resourceId,
      });
      if (!valid) {
        console.warn("[SaaS Webhook] invalid signature topic=%s resource=%s", topic, resourceId);
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
    }

    const supabase = createServiceClient();
    const { data: existingEvent } = await supabase
      .from("saas_billing_events")
      .select("id, processed")
      .eq("event_topic", topic)
      .eq("event_resource_id", resourceId)
      .maybeSingle();

    if (existingEvent?.processed) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    await supabase
      .from("saas_billing_events")
      .upsert(
        {
          id: existingEvent?.id,
          event_topic: topic,
          event_resource_id: resourceId,
          payload,
          processed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_topic,event_resource_id" }
      );

    const markEventProcessed = async (tenantId?: string | null) => {
      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        processed: true,
        processed_at: now,
        updated_at: now,
      };
      if (tenantId) {
        updatePayload.tenant_id = tenantId;
      }
      await supabase
        .from("saas_billing_events")
        .update(updatePayload)
        .eq("event_topic", topic)
        .eq("event_resource_id", resourceId);
    };

    const isAuthorizedPayment = topic.includes("authorized_payment");
    const isSubscriptionEvent = topic.includes("preapproval") || topic.includes("subscription");

    if (!isAuthorizedPayment && !isSubscriptionEvent) {
      await markEventProcessed();
      return NextResponse.json({ received: true, ignored: true });
    }

    let preapprovalId: string | null = null;
    if (isAuthorizedPayment) {
      const authorized = await fetchAuthorizedPaymentById(resourceId);
      preapprovalId = (authorized?.preapproval_id && String(authorized.preapproval_id)) || null;
    } else {
      preapprovalId = resourceId;
    }

    if (!preapprovalId) {
      await markEventProcessed();
      return NextResponse.json({ received: true, ignored: true });
    }

    const preapproval = await fetchPreapprovalById(preapprovalId);
    if (!preapproval?.id) {
      await markEventProcessed();
      return NextResponse.json({ received: true, ignored: true });
    }

    const metadata = (preapproval.metadata as Record<string, unknown> | undefined) || {};
    const metadataTenantId = typeof metadata.tenant_id === "string" ? metadata.tenant_id : null;
    const externalRefTenant = typeof preapproval.external_reference === "string" ? preapproval.external_reference : null;
    const preapprovalPlanId = typeof preapproval.preapproval_plan_id === "string" ? preapproval.preapproval_plan_id : null;
    const metadataPlanTier = extractPlanTier(metadata.plan_tier);
    const preapprovalPlanTier = resolvePlanTierFromPlanId(preapprovalPlanId) ?? metadataPlanTier;
    const payerEmail = normalizeEmail(preapproval.payer_email);

    const loadTenant = async (id: string | null): Promise<TenantLookup | null> => {
      if (!id) return null;
      const { data } = await supabase
        .from("tenants")
        .select("id, email, business_name, plan_tier, saas_subscription_status, saas_subscription_id, saas_trial_consumed_at, pending_plan_tier, pending_plan_effective_at")
        .eq("id", id)
        .maybeSingle();
      return (data as TenantLookup | null) || null;
    };

    let tenantId: string | null = metadataTenantId || externalRefTenant;
    let tenantResolutionSource = metadataTenantId ? "metadata" : externalRefTenant ? "external_reference" : "none";
    let tenant = await loadTenant(tenantId);
    if (!tenant?.id) {
      tenantId = null;
      tenant = null;
    }

    if (!tenantId) {
      const { data: subByPreapproval } = await supabase
        .from("saas_subscriptions")
        .select("tenant_id")
        .eq("mp_preapproval_id", String(preapproval.id))
        .maybeSingle();

      if (typeof subByPreapproval?.tenant_id === "string" && subByPreapproval.tenant_id) {
        tenantId = subByPreapproval.tenant_id;
        tenantResolutionSource = "subscription_preapproval_id";
        tenant = await loadTenant(tenantId);
      }
    }

    if (!tenantId && payerEmail) {
      const { data: tenantByEmail } = await supabase
        .from("tenants")
        .select("id, email, business_name, plan_tier, saas_subscription_status, saas_subscription_id, saas_trial_consumed_at, pending_plan_tier, pending_plan_effective_at")
        .ilike("email", payerEmail)
        .maybeSingle();

      if (tenantByEmail?.id) {
        const recentWindowIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: recentAttempts } = await supabase
          .from("saas_billing_events")
          .select("payload, created_at")
          .eq("event_topic", "checkout_attempt")
          .eq("tenant_id", tenantByEmail.id)
          .gte("created_at", recentWindowIso)
          .order("created_at", { ascending: false })
          .limit(10);

        const hasMatchingAttempt = (recentAttempts || []).some((attempt) => {
          const attemptPayload = (attempt.payload as Record<string, unknown> | undefined) || {};
          const attemptPlanTier = extractPlanTier(attemptPayload.plan_tier);
          const attemptEmail = normalizeEmail(attemptPayload.tenant_email);
          if (preapprovalPlanTier && attemptPlanTier && attemptPlanTier !== preapprovalPlanTier) {
            return false;
          }
          if (payerEmail && attemptEmail && attemptEmail !== payerEmail) {
            return false;
          }
          return true;
        });

        if (hasMatchingAttempt) {
          tenantId = tenantByEmail.id;
          tenantResolutionSource = "payer_email+checkout_attempt";
          tenant = tenantByEmail as TenantLookup;
        }
      }
    }

    if (!tenantId && preapprovalPlanTier) {
      const narrowWindowIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentAttempts } = await supabase
        .from("saas_billing_events")
        .select("tenant_id, payload, created_at")
        .eq("event_topic", "checkout_attempt")
        .gte("created_at", narrowWindowIso)
        .order("created_at", { ascending: false })
        .limit(30);

      const matchingTenantIds = Array.from(
        new Set(
          (recentAttempts || [])
            .filter((attempt) => {
              const attemptPayload = (attempt.payload as Record<string, unknown> | undefined) || {};
              const attemptPlanTier = extractPlanTier(attemptPayload.plan_tier);
              if (attemptPlanTier !== preapprovalPlanTier) return false;
              const attemptEmail = normalizeEmail(attemptPayload.tenant_email);
              if (payerEmail && attemptEmail && attemptEmail !== payerEmail) return false;
              return typeof attempt.tenant_id === "string" && attempt.tenant_id.length > 0;
            })
            .map((attempt) => String(attempt.tenant_id))
        )
      );

      if (matchingTenantIds.length === 1) {
        tenantId = matchingTenantIds[0];
        tenantResolutionSource = "checkout_attempt_single_match";
        tenant = await loadTenant(tenantId);
      }
    }

    if (!tenant?.id || !tenantId) {
      console.warn(
        "[SaaS Webhook] tenant unresolved preapproval=%s metadata_tenant=%s external_ref=%s payer_email=%s",
        preapproval.id,
        metadataTenantId || "-",
        externalRefTenant || "-",
        payerEmail || "-"
      );
      await markEventProcessed();
      return NextResponse.json({ received: true, ignored: true });
    }

    const planTier = preapprovalPlanTier ?? tenant.plan_tier;
    const tenantStatus = normalizeSaaSSubscriptionStatus(preapproval.status);
    const oldPreapprovalId = typeof tenant.saas_subscription_id === "string" ? tenant.saas_subscription_id : null;
    const nextBillingDate =
      typeof preapproval.auto_recurring?.next_payment_date === "string"
        ? preapproval.auto_recurring.next_payment_date
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
    const shouldSendStatusEmail =
      Boolean(tenant.email) &&
      (
        String(tenant.saas_subscription_status || "inactive") !== tenantStatus ||
        String(tenant.plan_tier || "") !== planTier ||
        String(tenant.saas_subscription_id || "") !== String(preapproval.id)
      );

    await supabase.from("tenants").update(tenantUpdate).eq("id", tenantId);

    await supabase
      .from("saas_subscriptions")
      .upsert(
        {
          tenant_id: tenantId,
          mp_preapproval_id: String(preapproval.id),
          plan_tier: planTier,
          status: String(preapproval.status || "pending"),
          payer_email: typeof preapproval.payer_email === "string" ? preapproval.payer_email : null,
          external_reference: externalRefTenant || tenantId,
          started_at:
            typeof preapproval.auto_recurring?.start_date === "string"
              ? preapproval.auto_recurring.start_date
              : null,
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
        console.warn("[SaaS Webhook] could not cancel previous preapproval", {
          tenant_id: tenantId,
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
        .eq("tenant_id", tenantId)
        .eq("to_plan_tier", planTier)
        .eq("status", "scheduled");
    }

    if (shouldSendStatusEmail && tenant.email) {
      const emailResult = await sendSaasSubscriptionStatusEmail({
        tenantId,
        to: tenant.email,
        businessName: tenant.business_name || "Tu negocio",
        planTier,
        status: tenantStatus,
        preapprovalId: String(preapproval.id),
        nextBillingDate,
      });
      if (!emailResult.ok) {
        console.warn("[SaaS Webhook] could not send status email", {
          tenant_id: tenantId,
          preapproval_id: String(preapproval.id),
          status: tenantStatus,
          reason: emailResult.reason || "unknown",
        });
      }
    }

    await markEventProcessed(tenantId);
    console.info(
      "[SaaS Webhook] processed preapproval=%s tenant=%s source=%s",
      preapproval.id,
      tenantId,
      tenantResolutionSource
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SaaS Webhook] Error:", error);
    return NextResponse.json({ received: true });
  }
}
