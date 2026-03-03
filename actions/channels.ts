"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAppUrl } from "@/lib/app-url";
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

  const appUrl = getAppUrl();
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

export async function subscribeMetaWebhook(channelId: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("channel_type, access_token, provider_config")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!channel) return { success: false, error: "Canal no encontrado" };
  if (!channel.access_token) return { success: false, error: "No hay token de Meta" };

  const providerConfig = channel.provider_config as Record<string, string>;
  const pageId = providerConfig?.page_id;

  if (!pageId) return { success: false, error: "No se encontró el ID de la Página" };

  try {
    let fields = "messages,messaging_postbacks";
    if (channel.channel_type === "instagram") {
      fields = "messages,messaging_postbacks";
    }

    const url = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=${fields}&access_token=${channel.access_token}`;

    const response = await fetch(url, { method: "POST" });
    const result = await response.json();

    if (result.success) {
      return { success: true };
    } else {
      console.error("Error al suscribir webhook:", result);
      return { success: false, error: result.error?.message || "Error desconocido en Meta" };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export interface WhatsAppPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
}

/**
 * Obtiene la lista de números de WhatsApp asociados al WABA del canal.
 * Permite al usuario seleccionar su número sin copiar IDs manualmente.
 */
export async function getWhatsAppPhoneNumbers(
  channelId: string
): Promise<ActionResult<WhatsAppPhoneNumber[]>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: channel, error: fetchError } = await ctx.supabase
    .from("social_channels")
    .select("channel_type, access_token, provider_config")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (fetchError || !channel) return { success: false, error: "Canal no encontrado" };
  if (channel.channel_type !== "whatsapp") return { success: false, error: "Solo aplica a canales WhatsApp" };
  if (!channel.access_token) return { success: false, error: "El canal no tiene token. Usa Reconectar con Meta." };

  const wabaId = (channel.provider_config as Record<string, string>)?.waba_id;
  if (!wabaId) return { success: false, error: "No hay WABA ID. Usa Sincronizar número o completa manualmente." };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(channel.access_token as string)}`
    );
    const data = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message || "Error al obtener números" };
    }

    const phones = (data.data || []) as WhatsAppPhoneNumber[];
    if (phones.length === 0) {
      return { success: false, error: "No hay números registrados en esta cuenta de WhatsApp Business." };
    }

    return { success: true, data: phones };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

/**
 * Guarda el phone_number_id seleccionado por el usuario (cuando ya tiene waba_id).
 */
export async function selectWhatsAppPhoneNumber(
  channelId: string,
  phoneNumberId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (!phoneNumberId?.trim()) return { success: false, error: "Selecciona un número" };

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("channel_type, provider_config")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!channel) return { success: false, error: "Canal no encontrado" };
  if (channel.channel_type !== "whatsapp") return { success: false, error: "Solo aplica a canales WhatsApp" };

  const providerConfig = {
    ...((channel.provider_config as Record<string, unknown>) || {}),
    phone_number_id: phoneNumberId.trim(),
  };

  const { error } = await ctx.supabase
    .from("social_channels")
    .update({
      provider_config: providerConfig,
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/channels");
  return { success: true };
}

/**
 * Permite al usuario guardar manualmente el phone_number_id y waba_id
 * desde el panel de Meta Developers. Necesario porque el flujo OAuth
 * estándar de Facebook no devuelve estos IDs para WhatsApp
 * (requiere WhatsApp Embedded Signup).
 */
export async function updateWhatsAppConfig(
  channelId: string,
  phoneNumberId: string,
  wabaId: string
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  if (!phoneNumberId || !wabaId) {
    return { success: false, error: "Phone Number ID y WABA ID son obligatorios" };
  }

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("id, channel_type, provider_config")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!channel) return { success: false, error: "Canal no encontrado" };
  if (channel.channel_type !== "whatsapp") return { success: false, error: "Solo aplica a canales WhatsApp" };

  const providerConfig = {
    ...((channel.provider_config as Record<string, unknown>) || {}),
    phone_number_id: phoneNumberId.trim(),
    waba_id: wabaId.trim(),
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
  return { success: true };
}
