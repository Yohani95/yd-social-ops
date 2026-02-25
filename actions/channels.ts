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

/**
 * Obtiene phone_number_id y waba_id desde el token guardado (sin pasar por OAuth).
 * Útil cuando Reconectar con Meta no llega a mostrar pantalla de selección y los IDs quedan null.
 */
export async function syncWhatsAppChannel(channelId: string): Promise<ActionResult<{ phone_number_id: string | null; waba_id: string | null }>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: channel, error: fetchError } = await ctx.supabase
    .from("social_channels")
    .select("id, channel_type, access_token, provider_config")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (fetchError || !channel) return { success: false, error: "Canal no encontrado" };
  if (channel.channel_type !== "whatsapp") return { success: false, error: "Solo aplica a canales WhatsApp" };
  if (!channel.access_token) return { success: false, error: "El canal no tiene token. Usa Reconectar con Meta." };

  const metaAppId = process.env.META_APP_ID;
  const metaAppSecret = process.env.META_APP_SECRET;
  if (!metaAppId || !metaAppSecret) return { success: false, error: "META_APP_ID o META_APP_SECRET no configurados" };

  const accessToken = channel.access_token as string;

  const wabaRes = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(accessToken)}`,
    { headers: { Authorization: `Bearer ${metaAppId}|${metaAppSecret}` } }
  );
  const wabaData = await wabaRes.json();

  let phoneNumberId: string | null =
    wabaData?.data?.granular_scopes?.find(
      (s: { scope: string }) => s.scope === "whatsapp_business_messaging"
    )?.target_ids?.[0] ?? null;
  let wabaId: string | null =
    wabaData?.data?.granular_scopes?.find(
      (s: { scope: string }) => s.scope === "whatsapp_business_management"
    )?.target_ids?.[0] ?? wabaData?.data?.profile_id ?? null;

  if (wabaData?.data?.profile_id) wabaId = wabaId ?? wabaData.data.profile_id;
  if (wabaId && !phoneNumberId) {
    const phonesRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`
    );
    const phonesData = await phonesRes.json();
    const firstPhone = phonesData?.data?.[0];
    if (firstPhone?.id) phoneNumberId = firstPhone.id;
  }

  const providerConfig = {
    ...((channel.provider_config as Record<string, unknown>) || {}),
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
  };

  const { error: updateError } = await ctx.supabase
    .from("social_channels")
    .update({
      provider_config: providerConfig,
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath("/dashboard/channels");
  return { success: true, data: { phone_number_id: phoneNumberId, waba_id: wabaId } };
}
