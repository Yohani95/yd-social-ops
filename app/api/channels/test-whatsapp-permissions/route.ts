import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/channel-adapters";
import type { SocialChannel } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const channelId = searchParams.get("channelId");
  const testPhone = searchParams.get("testPhone");

  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
  if (!testPhone) {
    return NextResponse.json(
      { error: "Missing testPhone. Provee un numero valido con codigo de pais (ej. 569...)." },
      { status: 400 }
    );
  }

  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("*")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!channel || channel.channel_type !== "whatsapp") {
    return NextResponse.json({ error: "Canal WhatsApp no encontrado" }, { status: 404 });
  }

  const adapter = getAdapter("whatsapp");
  const results: Record<string, unknown> = {};

  try {
    await adapter.sendReply(
      testPhone,
      "Este es un mensaje de prueba para validar whatsapp_business_messaging en Meta Developers.",
      channel as SocialChannel
    );
    results.send_reply = { success: true, message: "Mensaje de WhatsApp enviado. Revisa tu celular." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "send_failed";
    results.send_reply = { error: message };
  }

  try {
    const wabaId = (channel.provider_config as Record<string, string> | undefined)?.waba_id;
    if (wabaId && channel.access_token) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(channel.access_token as string)}`
      );
      results.read_waba_phone_numbers = await res.json();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "read_failed";
    results.read_waba_phone_numbers = { error: message };
  }

  const now = new Date().toISOString();
  const existingConfig = (channel.config && typeof channel.config === "object")
    ? (channel.config as Record<string, unknown>)
    : {};
  const existingMetaReview = (existingConfig.meta_review && typeof existingConfig.meta_review === "object")
    ? (existingConfig.meta_review as Record<string, unknown>)
    : {};

  await ctx.supabase
    .from("social_channels")
    .update({
      config: {
        ...existingConfig,
        meta_review: {
          ...existingMetaReview,
          whatsapp_permissions: {
            last_test_at: now,
            success: Boolean((results.send_reply as { success?: boolean } | undefined)?.success),
            results,
          },
        },
      },
      updated_at: now,
    })
    .eq("id", channel.id)
    .eq("tenant_id", ctx.tenantId);

  return NextResponse.json({
    success: true,
    message: "Llamada de prueba de WhatsApp realizada. Revisa Meta Developers en unos minutos.",
    results,
  });
}
