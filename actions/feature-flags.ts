"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { invalidateFlagCache, type FeatureFlag } from "@/lib/feature-flags";
import type { ActionResult } from "@/types";

/**
 * Retorna todos los feature flags del tenant autenticado.
 */
export async function getFeatureFlags(): Promise<ActionResult<Record<string, boolean>>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autorizado" };

  const { data, error } = await ctx.supabase
    .from("tenant_bot_configs")
    .select("feature_flags")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };

  const flags =
    data?.feature_flags && typeof data.feature_flags === "object"
      ? (data.feature_flags as Record<string, boolean>)
      : {};

  return { success: true, data: flags };
}

/**
 * Activa o desactiva un feature flag para el tenant autenticado.
 * Invalida el cache de feature flags para que el cambio sea inmediato.
 */
export async function setFeatureFlag(
  flag: FeatureFlag,
  enabled: boolean
): Promise<ActionResult<Record<string, boolean>>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autorizado" };

  // Leer flags actuales
  const { data: existing } = await ctx.supabase
    .from("tenant_bot_configs")
    .select("feature_flags")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const currentFlags: Record<string, boolean> =
    existing?.feature_flags && typeof existing.feature_flags === "object"
      ? (existing.feature_flags as Record<string, boolean>)
      : {};

  const updatedFlags = { ...currentFlags, [flag]: enabled };

  const { data, error } = await ctx.supabase
    .from("tenant_bot_configs")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        feature_flags: updatedFlags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    )
    .select("feature_flags")
    .single();

  if (error) return { success: false, error: error.message };

  // Invalida cache para efecto inmediato (< 30s de propagación)
  invalidateFlagCache(ctx.tenantId);

  revalidatePath("/dashboard");
  return {
    success: true,
    data: (data?.feature_flags ?? updatedFlags) as Record<string, boolean>,
  };
}
