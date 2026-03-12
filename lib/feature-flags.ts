/**
 * Feature Flags — Fase 5
 *
 * Lee feature_flags JSONB de tenant_bot_configs.
 * Cache en memoria de 30s para reducir DB reads.
 *
 * Flags disponibles:
 * - rag_enabled: activa RAG en buildSystemPrompt
 * - instagram_comments_enabled: activa parser de comentarios IG en webhook
 * - repetition_guard_enabled: activa detección de repetición en quality tracker
 * - advanced_config_enabled: activa lectura de tenant_bot_configs en processMessage
 * - quality_tracking_enabled: activa escritura en bot_quality_events
 */

import { createServiceClient } from "@/lib/supabase/server";

export type FeatureFlag =
  | "rag_enabled"
  | "instagram_comments_enabled"
  | "repetition_guard_enabled"
  | "advanced_config_enabled"
  | "quality_tracking_enabled"
  | "workflow_engine_enabled"
  | "lead_lifecycle_enabled"
  | "campaigns_enabled"
  | "routing_enabled"
  | "conversion_analytics_enabled"
  | "event_queue_enabled"
  | "workflow_ui_enabled"
  | "ecommerce_enabled"
  | "scheduling_enabled";

// Cache simple en memoria (30s TTL)
const cache = new Map<string, { flags: Record<string, boolean>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function getCached(tenantId: string): Record<string, boolean> | null {
  const entry = cache.get(tenantId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(tenantId);
    return null;
  }
  return entry.flags;
}

function setCached(tenantId: string, flags: Record<string, boolean>): void {
  cache.set(tenantId, { flags, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getFlags(tenantId: string): Promise<Record<string, boolean>> {
  const cached = getCached(tenantId);
  if (cached) return cached;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("tenant_bot_configs")
      .select("feature_flags")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const flags =
      data?.feature_flags && typeof data.feature_flags === "object"
        ? (data.feature_flags as Record<string, boolean>)
        : {};

    setCached(tenantId, flags);
    return flags;
  } catch (err) {
    console.warn("[FeatureFlags] Error leyendo flags:", err);
    return {};
  }
}

/**
 * Devuelve true si el feature flag está habilitado para el tenant.
 * Por defecto false para cualquier flag no configurado.
 */
export async function isFeatureEnabled(tenantId: string, flag: FeatureFlag): Promise<boolean> {
  const flags = await getFlags(tenantId);
  return flags[flag] === true;
}

/**
 * Devuelve todos los flags del tenant.
 */
export async function getAllFlags(tenantId: string): Promise<Record<string, boolean>> {
  return getFlags(tenantId);
}

/**
 * Invalida el cache de un tenant (llamar después de actualizar flags).
 */
export function invalidateFlagCache(tenantId: string): void {
  cache.delete(tenantId);
}
