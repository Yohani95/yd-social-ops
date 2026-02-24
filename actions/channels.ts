"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, SocialChannel, ChatChannel } from "@/types";

export async function getChannels(): Promise<SocialChannel[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const { data } = await ctx.supabase
    .from("social_channels")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: true });

  return (data as SocialChannel[]) || [];
}

export async function createChannel(params: {
  channel_type: ChatChannel;
  display_name: string;
  channel_identifier?: string;
  webhook_secret?: string;
}): Promise<ActionResult<SocialChannel>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("plan_tier")
    .eq("id", ctx.tenantId)
    .single();

  if (!tenant) return { success: false, error: "Tenant no encontrado" };

  if (params.channel_type !== "web") {
    const { data: existing } = await ctx.supabase
      .from("social_channels")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .neq("channel_type", "web");

    const externalCount = existing?.length || 0;

    if (tenant.plan_tier === "basic") {
      return { success: false, error: "El plan Básico solo permite el canal Web. Actualiza a Pro." };
    }
    if (tenant.plan_tier === "pro" && externalCount >= 1) {
      return { success: false, error: "El plan Pro permite 1 canal externo. Actualiza a Enterprise." };
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/channels/webhook/${ctx.tenantId}`;

  const config: Record<string, unknown> = {};
  if (params.webhook_secret) config.webhook_secret = params.webhook_secret;

  const { data, error } = await ctx.supabase
    .from("social_channels")
    .insert({
      tenant_id: ctx.tenantId,
      channel_type: params.channel_type,
      display_name: params.display_name.trim(),
      channel_identifier: params.channel_identifier?.trim() || null,
      webhook_url: webhookUrl,
      config,
      is_active: true,
      connected_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes("unique") || error.code === "23505") {
      return { success: false, error: "Ya tienes un canal de este tipo configurado" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/channels");
  return { success: true, data: data as SocialChannel };
}

export async function toggleChannel(channelId: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("is_active")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!channel) return { success: false, error: "Canal no encontrado" };

  const { error } = await ctx.supabase
    .from("social_channels")
    .update({ is_active: !channel.is_active, updated_at: new Date().toISOString() })
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/channels");
  return { success: true };
}

export async function deleteChannel(channelId: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { error } = await ctx.supabase
    .from("social_channels")
    .delete()
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/channels");
  return { success: true };
}
