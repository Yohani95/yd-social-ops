import { createServiceClient } from "@/lib/supabase/server";
import { getMPClient, Preference } from "@/lib/mercadopago";
import { getAppUrl } from "@/lib/app-url";
import { sendPendingApprovalNotificationEmail } from "@/lib/email";
import type {
  ChatChannel,
  MerchantAdHocLinkMode,
  MerchantCheckoutMode,
  MerchantPaymentLink,
  MerchantPaymentLinkCreatedBy,
  MerchantPaymentLinkStatus,
  PlanTier,
} from "@/types";

interface TenantPaymentSettings {
  id: string;
  plan_tier: PlanTier;
  mp_access_token: string | null;
  merchant_checkout_mode: MerchantCheckoutMode;
  merchant_external_checkout_url: string | null;
  merchant_ad_hoc_link_mode: MerchantAdHocLinkMode;
  merchant_ad_hoc_max_amount_clp: number;
  merchant_ad_hoc_expiry_minutes: number;
}

export interface CreateMerchantPaymentLinkInput {
  tenantId: string;
  title: string;
  description?: string | null;
  amountClp: number;
  quantity?: number;
  channel?: ChatChannel | null;
  threadId?: string | null;
  contactId?: string | null;
  customerRef?: string | null;
  expiresMinutes?: number | null;
  createdBy: MerchantPaymentLinkCreatedBy;
  forceMode?: MerchantAdHocLinkMode;
}

export interface MerchantPaymentLinkResult {
  ok: boolean;
  error?: string;
  code?: string;
  link?: MerchantPaymentLink;
}

function normalizeText(value: string | null | undefined, max = 160): string {
  return (value || "").trim().slice(0, max);
}

function normalizeLongText(value: string | null | undefined, max = 1000): string | null {
  const v = (value || "").trim().slice(0, max);
  return v || null;
}

function normalizePositiveInt(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value || NaN)) return fallback;
  const parsed = Math.round(Number(value));
  return parsed > 0 ? parsed : fallback;
}

function normalizePositiveAmount(value: number | null | undefined): number {
  if (!Number.isFinite(value || NaN)) return 0;
  return Math.round(Number(value) * 100) / 100;
}

function resolveExpiresAt(minutes: number): string {
  const ms = Date.now() + minutes * 60 * 1000;
  return new Date(ms).toISOString();
}

function resolveIdempotencyWindowMinutes(): number {
  const raw = Number(process.env.MERCHANT_AD_HOC_IDEMPOTENCY_MINUTES || 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.min(Math.max(Math.round(raw), 1), 240);
}

async function getTenantPaymentSettings(tenantId: string): Promise<TenantPaymentSettings | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, plan_tier, mp_access_token, merchant_checkout_mode, merchant_external_checkout_url, merchant_ad_hoc_link_mode, merchant_ad_hoc_max_amount_clp, merchant_ad_hoc_expiry_minutes")
    .eq("id", tenantId)
    .maybeSingle();

  return (data as TenantPaymentSettings | null) || null;
}

async function createAdHocPreference(params: {
  tenant: TenantPaymentSettings;
  linkId: string;
  title: string;
  description?: string | null;
  amountClp: number;
  quantity: number;
  expiresAt: string;
  channel?: ChatChannel | null;
  threadId?: string | null;
  contactId?: string | null;
  customerRef?: string | null;
}) {
  if (params.tenant.merchant_checkout_mode === "external_link") {
    const external = normalizeText(params.tenant.merchant_external_checkout_url, 500);
    if (!external) {
      return {
        ok: false,
        code: "external_link_missing",
        error: "El tenant no tiene link externo configurado.",
      } as const;
    }

    return {
      ok: true,
      preferenceId: `external_link:${params.linkId}`,
      initPoint: external,
      sandboxInitPoint: external,
      mode: "external_link",
    } as const;
  }

  if (params.tenant.merchant_checkout_mode !== "mp_oauth") {
    return {
      ok: false,
      code: "checkout_mode_not_supported",
      error: "El modo actual del tenant no permite crear links automaticos.",
    } as const;
  }

  if (!params.tenant.mp_access_token) {
    return {
      ok: false,
      code: "missing_mp_oauth",
      error: "Mercado Pago OAuth no esta conectado para este tenant.",
    } as const;
  }

  try {
    const mpClient = getMPClient(params.tenant.mp_access_token);
    const preference = new Preference(mpClient);
    const appUrl = getAppUrl();
    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            id: params.linkId,
            title: params.title,
            description: params.description || undefined,
            quantity: params.quantity,
            unit_price: Number(params.amountClp),
            currency_id: "CLP",
          },
        ],
        back_urls: {
          success: `${appUrl}/payment/success`,
          failure: `${appUrl}/payment/failure`,
          pending: `${appUrl}/payment/pending`,
        },
        auto_return: "approved",
        notification_url: `${appUrl}/api/webhooks/payment?tenant_id=${params.tenant.id}`,
        external_reference: params.linkId,
        expires: true,
        expiration_date_to: params.expiresAt,
        metadata: {
          tenant_id: params.tenant.id,
          merchant_payment_link_id: params.linkId,
          kind: "ad_hoc",
          title: params.title,
          amount_clp: params.amountClp,
          quantity: params.quantity,
          channel: params.channel || null,
          thread_id: params.threadId || null,
          contact_id: params.contactId || null,
          customer_ref: params.customerRef || null,
        },
      },
      requestOptions: {
        idempotencyKey: `merchant-link-${params.linkId}`,
      },
    });

    return {
      ok: true,
      preferenceId: preferenceResult.id || null,
      initPoint: preferenceResult.init_point || null,
      sandboxInitPoint: preferenceResult.sandbox_init_point || null,
      mode: "mp_oauth",
    } as const;
  } catch (error) {
    return {
      ok: false,
      code: "mp_preference_create_failed",
      error: error instanceof Error ? error.message : "No se pudo crear la preferencia en Mercado Pago.",
    } as const;
  }
}

async function getLinkById(tenantId: string, linkId: string): Promise<MerchantPaymentLink | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("merchant_payment_links")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", linkId)
    .maybeSingle();

  return (data as MerchantPaymentLink | null) || null;
}

export async function createMerchantPaymentLink(
  input: CreateMerchantPaymentLinkInput
): Promise<MerchantPaymentLinkResult> {
  const title = normalizeText(input.title, 160);
  if (!title) {
    return { ok: false, code: "missing_title", error: "El titulo es obligatorio." };
  }

  const amountClp = normalizePositiveAmount(input.amountClp);
  if (!amountClp || amountClp <= 0) {
    return { ok: false, code: "invalid_amount", error: "El monto debe ser mayor a 0." };
  }

  const quantity = normalizePositiveInt(input.quantity, 1);
  const tenant = await getTenantPaymentSettings(input.tenantId);
  if (!tenant) {
    return { ok: false, code: "tenant_not_found", error: "Tenant no encontrado." };
  }

  if (amountClp > Number(tenant.merchant_ad_hoc_max_amount_clp || 0)) {
    return {
      ok: false,
      code: "amount_exceeds_limit",
      error: `El monto excede el limite permitido (${tenant.merchant_ad_hoc_max_amount_clp} CLP).`,
    };
  }

  const modeUsed = input.forceMode || tenant.merchant_ad_hoc_link_mode || "approval";
  const expiresMinutes = normalizePositiveInt(
    input.expiresMinutes,
    normalizePositiveInt(tenant.merchant_ad_hoc_expiry_minutes, 60)
  );
  const expiresAt = resolveExpiresAt(expiresMinutes);
  const idempotencyWindowMinutes = resolveIdempotencyWindowMinutes();
  const idempotencyFrom = new Date(Date.now() - idempotencyWindowMinutes * 60 * 1000).toISOString();

  const initialStatus: MerchantPaymentLinkStatus =
    modeUsed === "manual" ? "draft" : modeUsed === "approval" ? "pending_approval" : "draft";

  const supabase = createServiceClient();

  let dedupeQuery = supabase
    .from("merchant_payment_links")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("title", title)
    .eq("amount_clp", amountClp)
    .gte("created_at", idempotencyFrom)
    .in("status", ["draft", "pending_approval", "approved", "created", "paid"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.contactId) {
    dedupeQuery = dedupeQuery.eq("contact_id", input.contactId);
  } else {
    dedupeQuery = dedupeQuery.is("contact_id", null);
  }

  const { data: duplicateRows } = await dedupeQuery;
  const duplicate = Array.isArray(duplicateRows) && duplicateRows.length > 0
    ? (duplicateRows[0] as MerchantPaymentLink)
    : null;

  if (duplicate) {
    console.info("[Merchant Link] idempotent_hit", {
      tenant_id: input.tenantId,
      link_id: duplicate.id,
      mode_used: duplicate.mode_used,
      amount_clp: duplicate.amount_clp,
    });
    return { ok: true, link: duplicate };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("merchant_payment_links")
    .insert({
      tenant_id: input.tenantId,
      channel: input.channel || null,
      thread_id: input.threadId || null,
      contact_id: input.contactId || null,
      created_by: input.createdBy,
      mode_used: modeUsed,
      title,
      description: normalizeLongText(input.description, 1000),
      amount_clp: amountClp,
      quantity,
      expires_at: expiresAt,
      status: initialStatus,
      metadata: {
        customer_ref: normalizeText(input.customerRef, 120) || null,
        idempotency_window_minutes: idempotencyWindowMinutes,
      },
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    console.warn("[Merchant Link] insert_failed", {
      tenant_id: input.tenantId,
      code: "insert_failed",
      error: insertError?.message || "unknown",
    });
    return { ok: false, code: "insert_failed", error: insertError?.message || "No se pudo crear la solicitud." };
  }

  const row = inserted as MerchantPaymentLink;

  if (modeUsed !== "automatic") {
    console.info("[Merchant Link] created_request", {
      tenant_id: input.tenantId,
      link_id: row.id,
      mode_used: modeUsed,
      status: row.status,
      amount_clp: row.amount_clp,
    });

    // Notify owner when a link needs approval
    if (modeUsed === "approval" && row.status === "pending_approval") {
      notifyOwnerPendingApproval(input.tenantId, row).catch((err) =>
        console.warn("[Merchant Link] owner_notification_failed", err)
      );
    }

    return { ok: true, link: row };
  }

  const generated = await createAdHocPreference({
    tenant,
    linkId: row.id,
    title,
    description: normalizeLongText(input.description, 1000),
    amountClp,
    quantity,
    expiresAt,
    channel: input.channel,
    threadId: input.threadId,
    contactId: input.contactId,
    customerRef: input.customerRef,
  });

  if (!generated.ok) {
    const { data: failedRow } = await supabase
      .from("merchant_payment_links")
      .update({
        status: "failed",
        metadata: {
          ...((row.metadata as Record<string, unknown>) || {}),
          error_code: generated.code,
          error_message: generated.error,
        },
      })
      .eq("id", row.id)
      .eq("tenant_id", input.tenantId)
      .select("*")
      .single();

    console.warn("[Merchant Link] generation_failed", {
      tenant_id: input.tenantId,
      link_id: row.id,
      mode_used: modeUsed,
      code: generated.code,
      error: generated.error,
    });

    return {
      ok: false,
      code: generated.code,
      error: generated.error,
      link: (failedRow as MerchantPaymentLink) || row,
    };
  }

  const { data: createdRow } = await supabase
    .from("merchant_payment_links")
    .update({
      status: "created",
      mp_preference_id: generated.preferenceId,
      mp_init_point: generated.initPoint || generated.sandboxInitPoint,
      metadata: {
        ...((row.metadata as Record<string, unknown>) || {}),
        generation_mode: generated.mode,
      },
    })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .select("*")
    .single();

  console.info("[Merchant Link] created", {
    tenant_id: input.tenantId,
    link_id: row.id,
    mode_used: modeUsed,
    status: "created",
    preference_id: generated.preferenceId,
  });

  return { ok: true, link: (createdRow as MerchantPaymentLink) || row };
}

export async function approveMerchantPaymentLink(params: {
  tenantId: string;
  linkId: string;
  approvedBy: "owner" | "agent" | "api";
}): Promise<MerchantPaymentLinkResult> {
  const existing = await getLinkById(params.tenantId, params.linkId);
  if (!existing) {
    return { ok: false, code: "not_found", error: "Link no encontrado." };
  }

  if (existing.status === "paid") {
    return { ok: false, code: "already_paid", error: "El link ya fue pagado." };
  }

  if (existing.status === "rejected" || existing.status === "cancelled") {
    return { ok: false, code: "not_approvable", error: "Este link ya no puede aprobarse." };
  }

  if (existing.status === "created") {
    return { ok: true, link: existing };
  }

  const tenant = await getTenantPaymentSettings(params.tenantId);
  if (!tenant) {
    return { ok: false, code: "tenant_not_found", error: "Tenant no encontrado." };
  }

  const supabase = createServiceClient();

  await supabase
    .from("merchant_payment_links")
    .update({
      status: "approved",
      metadata: {
        ...((existing.metadata as Record<string, unknown>) || {}),
        approved_by: params.approvedBy,
        approved_at: new Date().toISOString(),
      },
    })
    .eq("id", existing.id)
    .eq("tenant_id", params.tenantId);

  const generated = await createAdHocPreference({
    tenant,
    linkId: existing.id,
    title: existing.title,
    description: existing.description,
    amountClp: Number(existing.amount_clp),
    quantity: normalizePositiveInt(existing.quantity, 1),
    expiresAt: existing.expires_at || resolveExpiresAt(normalizePositiveInt(tenant.merchant_ad_hoc_expiry_minutes, 60)),
    channel: existing.channel,
    threadId: existing.thread_id,
    contactId: existing.contact_id,
    customerRef:
      typeof (existing.metadata as Record<string, unknown>)?.customer_ref === "string"
        ? String((existing.metadata as Record<string, unknown>).customer_ref)
        : null,
  });

  if (!generated.ok) {
    const { data: failed } = await supabase
      .from("merchant_payment_links")
      .update({
        status: "failed",
        metadata: {
          ...((existing.metadata as Record<string, unknown>) || {}),
          error_code: generated.code,
          error_message: generated.error,
        },
      })
      .eq("id", existing.id)
      .eq("tenant_id", params.tenantId)
      .select("*")
      .single();

    return {
      ok: false,
      code: generated.code,
      error: generated.error,
      link: (failed as MerchantPaymentLink) || existing,
    };
  }

  const { data: updated } = await supabase
    .from("merchant_payment_links")
    .update({
      status: "created",
      mp_preference_id: generated.preferenceId,
      mp_init_point: generated.initPoint || generated.sandboxInitPoint,
      metadata: {
        ...((existing.metadata as Record<string, unknown>) || {}),
        generation_mode: generated.mode,
      },
    })
    .eq("id", existing.id)
    .eq("tenant_id", params.tenantId)
    .select("*")
    .single();

  return { ok: true, link: (updated as MerchantPaymentLink) || existing };
}

export async function rejectMerchantPaymentLink(params: {
  tenantId: string;
  linkId: string;
  rejectedBy: "owner" | "agent" | "api";
  reason?: string;
}): Promise<MerchantPaymentLinkResult> {
  const existing = await getLinkById(params.tenantId, params.linkId);
  if (!existing) {
    return { ok: false, code: "not_found", error: "Link no encontrado." };
  }

  if (existing.status === "paid") {
    return { ok: false, code: "already_paid", error: "El link ya fue pagado y no puede rechazarse." };
  }

  const supabase = createServiceClient();
  const { data: updated } = await supabase
    .from("merchant_payment_links")
    .update({
      status: "rejected",
      metadata: {
        ...((existing.metadata as Record<string, unknown>) || {}),
        rejected_by: params.rejectedBy,
        rejected_at: new Date().toISOString(),
        reject_reason: normalizeLongText(params.reason, 300),
      },
    })
    .eq("id", params.linkId)
    .eq("tenant_id", params.tenantId)
    .select("*")
    .single();

  return { ok: true, link: (updated as MerchantPaymentLink) || existing };
}

export async function listMerchantPaymentLinks(params: {
  tenantId: string;
  status?: MerchantPaymentLinkStatus;
  channel?: ChatChannel;
  contactId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: MerchantPaymentLink[]; hasMore: boolean; nextOffset: number | null }> {
  const supabase = createServiceClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);
  const offset = Math.max(params.offset || 0, 0);

  let query = supabase
    .from("merchant_payment_links")
    .select("*")
    .eq("tenant_id", params.tenantId);

  if (params.status) query = query.eq("status", params.status);
  if (params.channel) query = query.eq("channel", params.channel);
  if (params.contactId) query = query.eq("contact_id", params.contactId);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);

  const { data } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  const rows = (data as MerchantPaymentLink[]) || [];
  const hasMore = rows.length > limit;

  return {
    data: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function getMerchantPaymentLink(params: {
  tenantId: string;
  linkId: string;
}): Promise<MerchantPaymentLink | null> {
  return getLinkById(params.tenantId, params.linkId);
}

export async function markMerchantPaymentLinkPaid(params: {
  tenantId: string;
  linkId: string;
  paymentEventId?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("merchant_payment_links")
    .update({
      status: "paid",
      payment_event_id: params.paymentEventId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.linkId);
}

async function notifyOwnerPendingApproval(
  tenantId: string,
  link: MerchantPaymentLink
): Promise<void> {
  const supabase = createServiceClient();

  const { data: tenantUser } = await supabase
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .single();

  if (!tenantUser) return;

  const { data: { user } } = await supabase.auth.admin.getUserById(tenantUser.user_id);
  if (!user?.email) return;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("business_name")
    .eq("id", tenantId)
    .single();

  const appUrl = getAppUrl();
  const customerRef =
    typeof (link.metadata as Record<string, unknown>)?.customer_ref === "string"
      ? String((link.metadata as Record<string, unknown>).customer_ref)
      : "Cliente";

  await sendPendingApprovalNotificationEmail({
    tenantId,
    to: user.email,
    businessName: tenant?.business_name || "Tu negocio",
    linkTitle: link.title,
    amount: `$${Number(link.amount_clp).toLocaleString("es-CL")} CLP`,
    customerRef,
    dashboardUrl: `${appUrl}/dashboard/payments`,
  });
}

export async function markMerchantPaymentLinkFailedByPreference(params: {
  tenantId: string;
  preferenceId: string;
  status: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("merchant_payment_links")
    .update({
      status: "failed",
      metadata: {
        payment_status: params.status,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", params.tenantId)
    .eq("mp_preference_id", params.preferenceId)
    .in("status", ["created", "approved"]);
}
