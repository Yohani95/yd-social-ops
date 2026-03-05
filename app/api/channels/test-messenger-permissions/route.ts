import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/channel-adapters";
import { safeDecrypt } from "@/lib/encryption";
import type { SocialChannel } from "@/types";

type TokenSource =
  | "oauth_user_token"
  | "oauth_user_token_tenant_fallback"
  | "channel_access_token"
  | "missing_user_token";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const channelId = searchParams.get("channelId");
  const testPhone = searchParams.get("testPhone");

  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
  if (!testPhone) {
    return NextResponse.json(
      { error: "Missing testPhone. Provee el ID de usuario de Messenger de prueba." },
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

  if (!channel || channel.channel_type !== "messenger") {
    return NextResponse.json({ error: "Canal Messenger no encontrado" }, { status: 404 });
  }

  const adapter = getAdapter("messenger");
  const providerConfig =
    channel.provider_config && typeof channel.provider_config === "object"
      ? (channel.provider_config as Record<string, unknown>)
      : {};
  let nextProviderConfig: Record<string, unknown> = { ...providerConfig };
  const userTokenEncrypted =
    typeof providerConfig.meta_user_access_token_encrypted === "string"
      ? providerConfig.meta_user_access_token_encrypted
      : null;

  let effectiveUserTokenEncrypted = userTokenEncrypted;
  let decryptedUserToken = safeDecrypt(userTokenEncrypted);
  let tokenSource: TokenSource = decryptedUserToken ? "oauth_user_token" : "missing_user_token";

  if (!decryptedUserToken) {
    const { data: metaChannels } = await ctx.supabase
      .from("social_channels")
      .select("provider_config, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .in("channel_type", ["instagram", "messenger", "whatsapp"])
      .order("updated_at", { ascending: false });

    for (const candidate of metaChannels ?? []) {
      const candidateConfig =
        candidate.provider_config && typeof candidate.provider_config === "object"
          ? (candidate.provider_config as Record<string, unknown>)
          : {};
      const candidateEncrypted =
        typeof candidateConfig.meta_user_access_token_encrypted === "string"
          ? candidateConfig.meta_user_access_token_encrypted
          : null;
      const candidateToken = safeDecrypt(candidateEncrypted);
      if (candidateToken && candidateEncrypted) {
        decryptedUserToken = candidateToken;
        effectiveUserTokenEncrypted = candidateEncrypted;
        tokenSource = "oauth_user_token_tenant_fallback";
        break;
      }
    }
  }

  const userToken = decryptedUserToken || (channel.access_token as string | null);
  if (!decryptedUserToken && userToken) tokenSource = "channel_access_token";

  const results: Record<string, unknown> = {};

  try {
    await adapter.sendReply(testPhone, "[META_TEST]", channel as SocialChannel);
    results.send_reply = { success: true, message: "Mensaje [META_TEST] enviado. Revisa tu Messenger." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "send_failed";
    results.send_reply = { error: message };
  }

  try {
    if (userToken) {
      const meRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${userToken}`
      );
      const meData = await meRes.json();
      if (decryptedUserToken && effectiveUserTokenEncrypted && !meData?.error) {
        nextProviderConfig = {
          ...nextProviderConfig,
          meta_user_access_token_encrypted: effectiveUserTokenEncrypted,
          meta_user_id: typeof meData?.id === "string" ? meData.id : null,
          meta_user_name: typeof meData?.name === "string" ? meData.name : null,
          meta_user_email: typeof meData?.email === "string" ? meData.email : null,
        };
      }
      results.read_page_info = {
        token_source: tokenSource,
        ...meData,
      };
    } else {
      results.read_page_info = { error: "missing_user_token", token_source: "missing_user_token" };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "read_failed";
    results.read_page_info = { error: message, token_source: tokenSource };
  }

  const now = new Date().toISOString();
  const existingConfig = (channel.config && typeof channel.config === "object")
    ? (channel.config as Record<string, unknown>)
    : {};
  const existingMetaReview = (existingConfig.meta_review && typeof existingConfig.meta_review === "object")
    ? (existingConfig.meta_review as Record<string, unknown>)
    : {};
  const success = Boolean((results.send_reply as { success?: boolean } | undefined)?.success)
    && !((results.read_page_info as { error?: string } | undefined)?.error);

  await ctx.supabase
    .from("social_channels")
    .update({
      provider_config: nextProviderConfig,
      config: {
        ...existingConfig,
        meta_review: {
          ...existingMetaReview,
          messenger_permissions: {
            last_test_at: now,
            success,
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
    message: "Prueba de Messenger ejecutada correctamente.",
    results,
  });
}
