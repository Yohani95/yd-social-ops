"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import type { ActionResult, TenantUpdate } from "@/types";

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
  planTier: "basic" | "pro" | "enterprise"
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
