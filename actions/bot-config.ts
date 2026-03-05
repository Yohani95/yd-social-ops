"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ActionResult, TenantBotConfig, ChannelAutomationRule } from "@/types";

const DEFAULT_CONFIG: Omit<TenantBotConfig, "id" | "tenant_id" | "created_at" | "updated_at"> = {
  default_tone: "amigable",
  max_response_chars_by_channel: {},
  coherence_window_turns: 10,
  repetition_guard_enabled: true,
  fallback_to_human_enabled: false,
  fallback_confidence_threshold: 0.4,
  sensitive_topics_policy: "moderate",
  channel_overrides: {},
  feature_flags: {},
};

// ============================================================
// Bot Config CRUD
// ============================================================

export async function getBotConfig(): Promise<ActionResult<TenantBotConfig>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autorizado" };

  const { data, error } = await ctx.supabase
    .from("tenant_bot_configs")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };

  if (!data) {
    return {
      success: true,
      data: {
        ...DEFAULT_CONFIG,
        id: "",
        tenant_id: ctx.tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  }

  return { success: true, data: data as TenantBotConfig };
}

export async function updateBotConfig(
  updates: Partial<Omit<TenantBotConfig, "id" | "tenant_id" | "created_at" | "updated_at">>
): Promise<ActionResult<TenantBotConfig>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autorizado" };

  const payload = {
    tenant_id: ctx.tenantId,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("tenant_bot_configs")
    .upsert(payload, { onConflict: "tenant_id" })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");
  return { success: true, data: data as TenantBotConfig };
}

// ============================================================
// Automation Rules
// ============================================================

export async function getAutomationRules(channelId: string): Promise<ActionResult<ChannelAutomationRule[]>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autorizado" };

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("channel_type")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!channel) return { success: false, error: "Canal no encontrado" };

  const { data, error } = await ctx.supabase
    .from("channel_automation_rules")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("channel", channel.channel_type)
    .order("priority", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as ChannelAutomationRule[] };
}

export async function updateAutomationRules(
  channelId: string,
  rules: Partial<ChannelAutomationRule>[]
): Promise<ActionResult<ChannelAutomationRule[]>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autorizado" };

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("channel_type")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!channel) return { success: false, error: "Canal no encontrado" };

  const upsertPayload = rules.map((rule) => ({
    tenant_id: ctx.tenantId,
    channel: channel.channel_type,
    event_type: rule.event_type ?? "dm",
    is_active: rule.is_active ?? false,
    allowed_actions: rule.allowed_actions ?? ["auto_reply"],
    confidence_threshold: rule.confidence_threshold ?? 0.7,
    quiet_hours_policy: rule.quiet_hours_policy ?? null,
    safety_policy_ref: rule.safety_policy_ref ?? null,
    priority: rule.priority ?? 0,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await ctx.supabase
    .from("channel_automation_rules")
    .upsert(upsertPayload, { onConflict: "tenant_id,channel,event_type" })
    .select();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");
  return { success: true, data: (data ?? []) as ChannelAutomationRule[] };
}
