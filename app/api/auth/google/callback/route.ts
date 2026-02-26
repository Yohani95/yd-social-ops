import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";

const GOOGLE_OAUTH_NONCE_COOKIE = "yd_oauth_nonce_gmail";
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

function redirectWithCookieClear(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return redirectWithCookieClear(
      `${appUrl}/dashboard/settings?gmail_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return redirectWithCookieClear(
      `${appUrl}/dashboard/settings?gmail_error=missing_params`
    );
  }

  let tenantId = "";
  let nonce = "";
  let ts = 0;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    tenantId = typeof decoded.tenant_id === "string" ? decoded.tenant_id : "";
    nonce = typeof decoded.nonce === "string" ? decoded.nonce : "";
    ts = Number(decoded.ts || 0);
  } catch {
    return redirectWithCookieClear(
      `${appUrl}/dashboard/settings?gmail_error=invalid_state`
    );
  }

  const cookieNonce = request.cookies.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value;
  const age = Date.now() - ts;
  const validNonce = nonce && cookieNonce && nonce === cookieNonce;
  const validAge = Number.isFinite(age) && age >= 0 && age <= OAUTH_STATE_MAX_AGE_MS;
  if (!tenantId || !validNonce || !validAge) {
    return redirectWithCookieClear(
      `${appUrl}/dashboard/settings?gmail_error=invalid_state`
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithCookieClear(
      `${appUrl}/dashboard/settings?gmail_error=config_missing`
    );
  }

  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return redirectWithCookieClear(
        `${appUrl}/dashboard/settings?gmail_error=unauthorized_state`
      );
    }

    const securityClient = createServiceClient();
    const { data: membership } = await securityClient
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!membership) {
      return redirectWithCookieClear(
        `${appUrl}/dashboard/settings?gmail_error=unauthorized_state`
      );
    }

    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return redirectWithCookieClear(
        `${appUrl}/dashboard/settings?gmail_error=token_exchange_failed`
      );
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileRes.json()) as { email?: string };
    const email = profile?.email?.trim();
    if (!email) {
      return redirectWithCookieClear(
        `${appUrl}/dashboard/settings?gmail_error=userinfo_failed`
      );
    }

    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("tenant_id", tenantId)
      .eq("provider", "gmail_oauth")
      .maybeSingle();

    const existingConfig = (existing?.config || {}) as Record<string, unknown>;
    const existingRefreshEncrypted =
      typeof existingConfig.refresh_token_encrypted === "string"
        ? existingConfig.refresh_token_encrypted
        : "";
    const existingRefresh =
      safeDecrypt(existingRefreshEncrypted) ||
      (typeof existingConfig.refresh_token === "string" ? existingConfig.refresh_token : "");
    const refreshToken = tokenData.refresh_token || existingRefresh;

    if (!refreshToken) {
      return redirectWithCookieClear(
        `${appUrl}/dashboard/settings?gmail_error=no_refresh_token`
      );
    }

    const config = {
      email,
      refresh_token_encrypted: encrypt(refreshToken),
    };

    const { error: upsertError } = await supabase
      .from("tenant_integrations")
      .upsert(
        {
          tenant_id: tenantId,
          provider: "gmail_oauth",
          is_active: true,
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,provider" }
      );

    if (upsertError) {
      return redirectWithCookieClear(
        `${appUrl}/dashboard/settings?gmail_error=db_error`
      );
    }

    return redirectWithCookieClear(`${appUrl}/dashboard/settings?gmail_success=true`);
  } catch (err) {
    console.error("[Google OAuth] callback error:", err);
    return redirectWithCookieClear(
      `${appUrl}/dashboard/settings?gmail_error=unknown`
    );
  }
}

