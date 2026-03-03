import { getAppUrl, normalizeBaseUrl } from "@/lib/app-url";
import type { PlanTier, SubscriptionStatus } from "@/types";

export type SaaSSubscribeMode = "plan_checkout" | "preapproval_plan" | "preapproval_no_plan";

export interface MPPreapprovalResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  status?: string;
  date_created?: string;
  reason?: string;
  external_reference?: string;
  payer_email?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    start_date?: string;
    end_date?: string;
    transaction_amount?: number;
    currency_id?: string;
    next_payment_date?: string;
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MPAuthorizedPaymentResponse {
  id?: number | string;
  preapproval_id?: string;
  status?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface MPUserMeResponse {
  id?: number | string;
  [key: string]: unknown;
}

interface MPPreapprovalPlanResponse {
  id?: string;
  collector_id?: number | string;
  application_id?: number | string;
  [key: string]: unknown;
}

interface MPPreapprovalSearchResponse {
  results?: MPPreapprovalResponse[];
  [key: string]: unknown;
}

function getSaaSAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MP_ACCESS_TOKEN no configurado");
  }
  return token;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = (value || "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function parsePositiveAmount(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
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

function resolveSaaSBackBaseUrl(): string | null {
  const candidates = [
    process.env.MP_SAAS_BACK_URL_BASE,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    getAppUrl(""),
  ];

  for (const raw of candidates) {
    const normalized = normalizeBaseUrl(raw || "");
    if (!normalized) continue;
    if (!isPublicHttpsUrl(normalized)) continue;
    return normalized;
  }

  return null;
}

export function getSaaSSubscribeMode(): SaaSSubscribeMode {
  const raw = (process.env.MP_SAAS_SUBSCRIBE_MODE || "").trim().toLowerCase();
  if (raw === "preapproval_plan") return "preapproval_plan";
  if (raw === "preapproval_no_plan") return "preapproval_no_plan";
  return "plan_checkout";
}

export function getSaaSPlanAmount(planTier: PlanTier): number {
  const map: Record<PlanTier, number> = {
    basic: parsePositiveAmount(process.env.MP_SAAS_PLAN_AMOUNT_BASIC, 9990),
    pro: parsePositiveAmount(process.env.MP_SAAS_PLAN_AMOUNT_PRO, 24990),
    business: parsePositiveAmount(process.env.MP_SAAS_PLAN_AMOUNT_BUSINESS, 49990),
    enterprise: parsePositiveAmount(process.env.MP_SAAS_PLAN_AMOUNT_ENTERPRISE, 79990),
    enterprise_plus: parsePositiveAmount(process.env.MP_SAAS_PLAN_AMOUNT_ENTERPRISE_PLUS, 199990),
  };
  return map[planTier];
}

export function getSaaSPreapprovalPlanId(
  planTier: PlanTier,
  options?: { trialEligible?: boolean }
): string {
  const trialEligible = options?.trialEligible ?? true;
  const trialMap: Record<PlanTier, string | undefined> = {
    basic: process.env.MP_PREAPPROVAL_PLAN_BASIC,
    pro: process.env.MP_PREAPPROVAL_PLAN_PRO,
    business: process.env.MP_PREAPPROVAL_PLAN_BUSINESS,
    enterprise: process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE,
    enterprise_plus: process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS,
  };
  const noTrialMap: Record<PlanTier, string | undefined> = {
    basic: process.env.MP_PREAPPROVAL_PLAN_BASIC_NO_TRIAL,
    pro: process.env.MP_PREAPPROVAL_PLAN_PRO_NO_TRIAL,
    business: process.env.MP_PREAPPROVAL_PLAN_BUSINESS_NO_TRIAL,
    enterprise: process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE_NO_TRIAL,
    enterprise_plus: process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS_NO_TRIAL,
  };

  if (!trialEligible) {
    // Fallback operativo: si no existe plan sin trial, usar plan normal.
    return (noTrialMap[planTier] || trialMap[planTier] || "").trim();
  }

  return (trialMap[planTier] || "").trim();
}

/**
 * Resuelve el PlanTier a partir del preapproval_plan_id que devuelve MP.
 * Compara contra los IDs configurados en env vars (100% bajo nuestro control).
 * Retorna null si el plan_id no coincide con ningún plan conocido.
 */
export function resolvePlanTierFromPlanId(preapprovalPlanId: string | null | undefined): PlanTier | null {
  if (!preapprovalPlanId) return null;
  const map: Partial<Record<string, PlanTier>> = {
    [process.env.MP_PREAPPROVAL_PLAN_BASIC || ""]: "basic",
    [process.env.MP_PREAPPROVAL_PLAN_PRO || ""]: "pro",
    [process.env.MP_PREAPPROVAL_PLAN_BUSINESS || ""]: "business",
    [process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE || ""]: "enterprise",
    [process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS || ""]: "enterprise_plus",
    [process.env.MP_PREAPPROVAL_PLAN_BASIC_NO_TRIAL || ""]: "basic",
    [process.env.MP_PREAPPROVAL_PLAN_PRO_NO_TRIAL || ""]: "pro",
    [process.env.MP_PREAPPROVAL_PLAN_BUSINESS_NO_TRIAL || ""]: "business",
    [process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE_NO_TRIAL || ""]: "enterprise",
    [process.env.MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS_NO_TRIAL || ""]: "enterprise_plus",
  };
  // Eliminar entrada vacía si alguna env var no está configurada
  delete map[""];
  return map[preapprovalPlanId] ?? null;
}

export async function verifySaaSPlanOwnership(planId: string): Promise<{
  valid: boolean;
  callerId?: string;
  collectorId?: string;
  applicationId?: string;
  reason?: string;
}> {
  const token = getSaaSAccessToken();
  if (!planId) {
    return { valid: false, reason: "plan_id_missing" };
  }

  const [meRes, planRes] = await Promise.all([
    fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://api.mercadopago.com/preapproval_plan/${planId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  if (!meRes.ok) {
    return { valid: false, reason: `caller_lookup_failed:${meRes.status}` };
  }
  if (!planRes.ok) {
    return { valid: false, reason: `plan_lookup_failed:${planRes.status}` };
  }

  const me = (await meRes.json()) as MPUserMeResponse;
  const plan = (await planRes.json()) as MPPreapprovalPlanResponse;

  const callerId = me.id ? String(me.id) : "";
  const collectorId = plan.collector_id ? String(plan.collector_id) : "";
  const applicationId = plan.application_id ? String(plan.application_id) : "";

  if (!callerId || !collectorId) {
    return {
      valid: false,
      callerId: callerId || undefined,
      collectorId: collectorId || undefined,
      applicationId: applicationId || undefined,
      reason: "missing_caller_or_collector",
    };
  }

  return {
    valid: callerId === collectorId,
    callerId,
    collectorId,
    applicationId: applicationId || undefined,
    reason: callerId === collectorId ? undefined : "collector_mismatch",
  };
}

export function getSaaSPlanCheckoutLink(
  planTier: PlanTier,
  options?: { trialEligible?: boolean }
): string {
  const trialEligible = options?.trialEligible ?? true;
  const directMapTrial: Record<PlanTier, string | undefined> = {
    basic: process.env.MP_PLAN_BASIC_LINK,
    pro: process.env.MP_PLAN_PRO_LINK,
    business: process.env.MP_PLAN_BUSINESS_LINK,
    enterprise: process.env.MP_PLAN_ENTERPRISE_LINK,
    enterprise_plus: process.env.MP_PLAN_ENTERPRISE_PLUS_LINK,
  };
  const directMapNoTrial: Record<PlanTier, string | undefined> = {
    basic: process.env.MP_PLAN_BASIC_LINK_NO_TRIAL,
    pro: process.env.MP_PLAN_PRO_LINK_NO_TRIAL,
    business: process.env.MP_PLAN_BUSINESS_LINK_NO_TRIAL,
    enterprise: process.env.MP_PLAN_ENTERPRISE_LINK_NO_TRIAL,
    enterprise_plus: process.env.MP_PLAN_ENTERPRISE_PLUS_LINK_NO_TRIAL,
  };

  const directCandidate = trialEligible
    ? directMapTrial[planTier]
    : (directMapNoTrial[planTier] || directMapTrial[planTier]);
  const directUrl = (directCandidate || "").trim();
  if (directUrl) return directUrl;

  const planId = getSaaSPreapprovalPlanId(planTier, { trialEligible });
  if (!planId) return "";
  return `https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${planId}`;
}

export async function createSaaSPreapproval(params: {
  tenantId: string;
  email: string;
  planTier: PlanTier;
  mode?: SaaSSubscribeMode;
  trialEligible?: boolean;
}) {
  const token = getSaaSAccessToken();
  const mode = params.mode || "preapproval_plan";
  const planId = getSaaSPreapprovalPlanId(params.planTier, {
    trialEligible: params.trialEligible,
  });

  const backBaseUrl = resolveSaaSBackBaseUrl();
  if (!backBaseUrl) {
    throw new Error(
      "No se pudo resolver back_url publica HTTPS. Configura MP_SAAS_BACK_URL_BASE con tu URL publica (ngrok o dominio)."
    );
  }
  const backUrl = `${backBaseUrl}/dashboard/settings?tab=payments&subscribe_plan=${encodeURIComponent(params.planTier)}&mp_sub_return=1`;

  const basePayload: Record<string, unknown> = {
    external_reference: params.tenantId,
    back_url: backUrl,
    reason: `YD Social Ops - Plan ${params.planTier}`,
    status: "pending",
    metadata: {
      tenant_id: params.tenantId,
      plan_tier: params.planTier,
    },
  };

  if (mode === "preapproval_plan") {
    if (!planId) {
      throw new Error(`No existe MP_PREAPPROVAL_PLAN para ${params.planTier}`);
    }
    basePayload.preapproval_plan_id = planId;
  }

  if (mode === "preapproval_no_plan") {
    basePayload.auto_recurring = {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: getSaaSPlanAmount(params.planTier),
      currency_id: "CLP",
    };
  }

  const request = async (payload: Record<string, unknown>) =>
    fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  const tenantEmail = normalizeEmail(params.email);
  const sandboxPayerEmail = normalizeEmail(process.env.MP_SANDBOX_PAYER_EMAIL);
  const isTestToken = token.startsWith("TEST-");
  const forceSandboxPayer = (process.env.MP_FORCE_SANDBOX_PAYER_EMAIL || "").trim().toLowerCase() === "true";

  const payerCandidates = Array.from(
    new Set(
      [
        forceSandboxPayer ? sandboxPayerEmail : null,
        tenantEmail,
        sandboxPayerEmail,
      ].filter((value): value is string => Boolean(value))
    )
  );

  const attemptErrors: string[] = [];
  for (const payerEmail of payerCandidates) {
    const res = await request({
      ...basePayload,
      payer_email: payerEmail,
    });

    if (res.ok) {
      return (await res.json()) as MPPreapprovalResponse;
    }

    const errorBody = await res.text();
    attemptErrors.push(`payer_email=${payerEmail} -> ${res.status} ${errorBody}`);
  }

  if ((isTestToken || forceSandboxPayer) && !sandboxPayerEmail) {
    throw new Error(
      `Error creando preapproval: sandbox requiere email de usuario de prueba. Configura MP_SANDBOX_PAYER_EMAIL. Detalle: ${attemptErrors.join(" | ")}`
    );
  }

  throw new Error(`Error creando preapproval: ${attemptErrors.join(" | ")}`);
}

export async function fetchPreapprovalById(preapprovalId: string) {
  const token = getSaaSAccessToken();
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as MPPreapprovalResponse;
}

export async function fetchLatestPreapprovalByExternalReference(externalReference: string) {
  const token = getSaaSAccessToken();
  const encoded = encodeURIComponent(externalReference);
  const res = await fetch(
    `https://api.mercadopago.com/preapproval/search?external_reference=${encoded}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as MPPreapprovalSearchResponse;
  const rows = (data.results || []).filter(
    (row) => typeof row.external_reference === "string" && row.external_reference === externalReference
  );
  rows.sort((a, b) => {
    const da = Date.parse(a.date_created || "");
    const db = Date.parse(b.date_created || "");
    return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
  });
  return rows[0] || null;
}

export async function fetchLatestPreapprovalByPlanId(planId: string) {
  const token = getSaaSAccessToken();
  const res = await fetch(
    "https://api.mercadopago.com/preapproval/search?limit=100",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as MPPreapprovalSearchResponse;
  const rows = (Array.isArray(data.results) ? data.results : []).filter(
    (row) => row?.preapproval_plan_id === planId
  );
  rows.sort((a, b) => {
    const da = Date.parse(a.date_created || "");
    const db = Date.parse(b.date_created || "");
    return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
  });
  return rows[0] || null;
}

export async function fetchAuthorizedPaymentById(authorizedPaymentId: string) {
  const token = getSaaSAccessToken();
  const res = await fetch(`https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as MPAuthorizedPaymentResponse;
}

export async function cancelPreapprovalById(preapprovalId: string): Promise<boolean> {
  const token = getSaaSAccessToken();
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  });

  return res.ok;
}

export function normalizeSaaSSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  const value = (status || "").toLowerCase();
  if (["authorized", "active"].includes(value)) return "active";
  if (["pending"].includes(value)) return "trial";
  return "inactive";
}

export function extractPlanTier(value: unknown): PlanTier | null {
  if (
    value === "basic" ||
    value === "pro" ||
    value === "business" ||
    value === "enterprise" ||
    value === "enterprise_plus"
  ) {
    return value;
  }
  return null;
}
