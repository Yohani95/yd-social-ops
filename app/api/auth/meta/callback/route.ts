import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";

const META_OAUTH_NONCE_COOKIE = "yd_oauth_nonce_meta";
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

function redirectWithMetaCookieClear(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.set(META_OAUTH_NONCE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}

/**
 * GET /api/auth/meta/callback
 *
 * OAuth callback for Meta (WhatsApp Business + Messenger).
 * After the tenant authorizes, Meta redirects here with:
 * - code: authorization code
 * - state: base64url encoded { tenant_id, channel_type }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const appUrl = getAppUrl();

  if (!code || !state) {
    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=missing_params`);
  }

  let stateData: { tenant_id: string; channel_type: string; nonce: string; ts: number };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=invalid_state`);
  }

  const { tenant_id, channel_type, nonce, ts } = stateData;
  const cookieNonce = request.cookies.get(META_OAUTH_NONCE_COOKIE)?.value;
  const stateAge = Date.now() - Number(ts || 0);
  const nonceValid = typeof nonce === "string" && nonce.length >= 8 && cookieNonce === nonce;
  const stateFresh = Number.isFinite(stateAge) && stateAge >= 0 && stateAge <= OAUTH_STATE_MAX_AGE_MS;
  if (!nonceValid || !stateFresh) {
    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=invalid_state`);
  }

  const allowedChannelTypes = new Set(["whatsapp", "messenger", "instagram"]);
  if (!allowedChannelTypes.has(channel_type)) {
    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=invalid_channel_type`);
  }

  const metaAppId = process.env.META_APP_ID;
  const metaAppSecret = process.env.META_APP_SECRET;
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  if (!metaAppId || !metaAppSecret) {
    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=config_missing`);
  }

  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=unauthorized_state`);
    }

    const securityClient = createServiceClient();
    const { data: membership } = await securityClient
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!membership) {
      console.warn("[Meta OAuth] unauthorized state. user=%s tenant=%s", user.id, tenant_id);
      return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=unauthorized_state`);
    }

    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", metaAppId);
    tokenUrl.searchParams.set("client_secret", metaAppSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[Meta OAuth] Token exchange failed:", tokenData);
      return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=token_failed`);
    }

    const accessToken = tokenData.access_token;

    let providerConfig: Record<string, unknown> = {};

    if (channel_type === "whatsapp") {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}`,
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

      // Fallback: si debug_token no devuelve target_ids, obtener WABA y números por API
      if ((!phoneNumberId || !wabaId) && wabaData?.data?.profile_id) {
        wabaId = wabaId ?? wabaData.data.profile_id;
      }
      if (wabaId && !phoneNumberId) {
        const phonesRes = await fetch(
          `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`
        );
        const phonesData = await phonesRes.json();
        const firstPhone = phonesData?.data?.[0];
        if (firstPhone?.id) {
          phoneNumberId = firstPhone.id;
        }
      }

      providerConfig = {
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
      };
    } else if (channel_type === "messenger") {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();
      const page = pagesData?.data?.[0];
      if (page) {
        providerConfig = {
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
        };
      }
    } else if (channel_type === "instagram") {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`
      );
      const pagesData = await pagesRes.json();
      const page = (pagesData?.data as Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }>)?.find(
        (p) => p.instagram_business_account?.id
      ) || pagesData?.data?.[0];
      if (page) {
        const igAccount = page.instagram_business_account;
        providerConfig = {
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          ig_account_id: igAccount?.id || page.id,
        };
      }
    }

    const supabase = createServiceClient();

    const finalAccessToken = channel_type === "messenger" || channel_type === "instagram"
      ? (providerConfig.page_access_token as string) || accessToken
      : accessToken;

    if (channel_type === "messenger" || channel_type === "instagram") {
      const pageId = providerConfig.page_id as string;
      if (pageId && finalAccessToken) {
        const fields = channel_type === "instagram"
          ? "messages,messaging_postbacks,instagram_manage_messages"
          : "messages,messaging_postbacks";

        try {
          const subRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=${fields}&access_token=${finalAccessToken}`, {
            method: "POST"
          });
          const subData = await subRes.json();
          if (!subData.success) {
            console.error("[Meta OAuth] Error al suscribir webhook:", subData);
          } else {
            console.info(`[Meta OAuth] Webhook suscrito exitosamente para ${channel_type} page ${pageId}`);
          }
        } catch (subErr) {
          console.error("[Meta OAuth] Exception al suscribir webhook:", subErr);
        }
      }
    }

    const { data: existing } = await supabase
      .from("social_channels")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("channel_type", channel_type)
      .single();

    if (existing) {
      await supabase
        .from("social_channels")
        .update({
          access_token: finalAccessToken,
          provider_config: providerConfig,
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      const webhookUrl = `${appUrl}/api/webhooks/meta`;
      const displayName =
        channel_type === "whatsapp"
          ? "WhatsApp Business"
          : channel_type === "instagram"
            ? `Instagram${providerConfig.page_name ? ` - ${providerConfig.page_name}` : ""}`
            : `Messenger${providerConfig.page_name ? ` - ${providerConfig.page_name}` : ""}`;
      await supabase.from("social_channels").insert({
        tenant_id,
        channel_type,
        display_name: displayName,
        access_token: finalAccessToken,
        webhook_url: webhookUrl,
        provider_config: providerConfig,
        config: {},
        is_active: true,
        connected_at: new Date().toISOString(),
      });
    }

    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_success=true`);
  } catch (error) {
    console.error("[Meta OAuth] Error:", error);
    return redirectWithMetaCookieClear(`${appUrl}/dashboard/channels?meta_error=unknown`);
  }
}
