"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import type { ActionResult, TenantUpdate, MerchantCheckoutMode } from "@/types";

export async function getMyTenant() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { tenant: null, error: "No autenticado" };

  const { data: tenant, error } = await ctx.supabase
    .from("tenants")
    .select("*")
    .eq("id", ctx.tenantId)
    .single();

  if (error) return { tenant: null, error: error.message };

  return { tenant, role: ctx.userRole, error: null };
}

export async function updateTenant(
  updates: TenantUpdate
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos para modificar el tenant" };

  const hasMerchantSettingsUpdate =
    updates.merchant_checkout_mode !== undefined ||
    updates.merchant_external_checkout_url !== undefined ||
    updates.merchant_ad_hoc_link_mode !== undefined ||
    updates.merchant_ad_hoc_max_amount_clp !== undefined ||
    updates.merchant_ad_hoc_expiry_minutes !== undefined;

  if (hasMerchantSettingsUpdate) {
    const { data: tenant } = await ctx.supabase
      .from("tenants")
      .select("plan_tier, merchant_external_checkout_url, merchant_checkout_mode, merchant_ad_hoc_link_mode")
      .eq("id", ctx.tenantId)
      .single();

    if (!tenant) {
      return { success: false, error: "Tenant no encontrado" };
    }

    const nextMode = (updates.merchant_checkout_mode || tenant.merchant_checkout_mode || "bank_transfer") as MerchantCheckoutMode;
    const nextExternalUrl = updates.merchant_external_checkout_url ?? tenant.merchant_external_checkout_url;
    const nextAdHocMode = updates.merchant_ad_hoc_link_mode || tenant.merchant_ad_hoc_link_mode || "approval";

    if (nextMode === "mp_oauth" && tenant.plan_tier === "basic") {
      return {
        success: false,
        error: "El plan Basico no permite OAuth de Mercado Pago. Usa link externo o transferencia.",
      };
    }

    if (nextMode === "external_link") {
      const value = nextExternalUrl?.trim();
      if (!value) {
        return { success: false, error: "Debes configurar un link externo para este modo de cobro." };
      }
      try {
        new URL(value);
      } catch {
        return { success: false, error: "El link externo no es una URL valida." };
      }
    }

    if (
      updates.merchant_ad_hoc_link_mode &&
      !["manual", "approval", "automatic"].includes(updates.merchant_ad_hoc_link_mode)
    ) {
      return { success: false, error: "Modo ad-hoc invalido. Usa manual, approval o automatic." };
    }

    if (nextAdHocMode === "automatic" && nextMode === "bank_transfer") {
      return {
        success: false,
        error: "El modo ad-hoc automatico requiere checkout OAuth o link externo.",
      };
    }

    if (updates.merchant_ad_hoc_max_amount_clp !== undefined) {
      const max = Number(updates.merchant_ad_hoc_max_amount_clp);
      if (!Number.isFinite(max) || max <= 0) {
        return { success: false, error: "El monto maximo ad-hoc debe ser mayor a 0." };
      }
    }

    if (updates.merchant_ad_hoc_expiry_minutes !== undefined) {
      const minutes = Number(updates.merchant_ad_hoc_expiry_minutes);
      if (!Number.isFinite(minutes) || minutes < 5 || minutes > 10080) {
        return {
          success: false,
          error: "La expiracion ad-hoc debe estar entre 5 y 10080 minutos.",
        };
      }
    }
  }

  const { error } = await ctx.supabase
    .from("tenants")
    .update(updates)
    .eq("id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateBankDetails(
  bankDetails: string
): Promise<ActionResult> {
  if (!bankDetails.trim()) {
    return { success: false, error: "Los datos bancarios no pueden estar vacíos" };
  }
  return updateTenant({ bank_details: bankDetails.trim() });
}

export async function saveMPTokens(params: {
  accessToken: string;
  refreshToken: string;
  mpUserId: string;
}): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos" };

  const { error } = await ctx.supabase
    .from("tenants")
    .update({
      mp_access_token: encrypt(params.accessToken),
      mp_refresh_token: encrypt(params.refreshToken),
      mp_user_id: params.mpUserId,
      mp_connected_at: new Date().toISOString(),
    })
    .eq("id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function disconnectMP(): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos" };

  const { error } = await ctx.supabase
    .from("tenants")
    .update({
      mp_access_token: null,
      mp_refresh_token: null,
      mp_user_id: null,
      mp_connected_at: null,
    })
    .eq("id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updatePlan(
  tenantId: string,
  planTier: "basic" | "pro" | "business" | "enterprise" | "enterprise_plus"
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos" };
  if (tenantId !== ctx.tenantId) return { success: false, error: "Tenant invalido" };

  const { error } = await ctx.supabase
    .from("tenants")
    .update({ plan_tier: planTier })
    .eq("id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true };
}

