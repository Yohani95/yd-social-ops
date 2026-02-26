import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeMPCode } from "@/lib/mercadopago";
import { encrypt } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";

const MP_OAUTH_NONCE_COOKIE = "yd_oauth_nonce_mp";
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

function redirectWithMpCookieClear(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.set(MP_OAUTH_NONCE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}

/**
 * GET /api/auth/mercadopago/callback
 *
 * Recibe el callback de Mercado Pago OAuth.
 * Intercambia el code por tokens y los guarda en la BD.
 */
export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.error("[MP OAuth] Error recibido de MP:", error);
    return redirectWithMpCookieClear(
      `${appUrl}/dashboard/settings?mp_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return redirectWithMpCookieClear(
      `${appUrl}/dashboard/settings?mp_error=missing_params`
    );
  }

  let tenantId: string;
  let stateNonce: string;
  let stateTs: number;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    );
    tenantId = decoded.tenant_id;
    stateNonce = decoded.nonce;
    stateTs = Number(decoded.ts || 0);
    if (!tenantId) throw new Error("tenant_id missing in state");
  } catch {
    return redirectWithMpCookieClear(
      `${appUrl}/dashboard/settings?mp_error=invalid_state`
    );
  }

  const cookieNonce = request.cookies.get(MP_OAUTH_NONCE_COOKIE)?.value;
  const stateAge = Date.now() - stateTs;
  const nonceValid =
    typeof stateNonce === "string" &&
    stateNonce.length >= 8 &&
    cookieNonce === stateNonce;
  const stateFresh =
    Number.isFinite(stateAge) &&
    stateAge >= 0 &&
    stateAge <= OAUTH_STATE_MAX_AGE_MS;
  if (!nonceValid || !stateFresh) {
    return redirectWithMpCookieClear(
      `${appUrl}/dashboard/settings?mp_error=invalid_state`
    );
  }

  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return redirectWithMpCookieClear(
        `${appUrl}/dashboard/settings?mp_error=unauthorized_state`
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
      console.warn("[MP OAuth] unauthorized state. user=%s tenant=%s", user.id, tenantId);
      return redirectWithMpCookieClear(
        `${appUrl}/dashboard/settings?mp_error=unauthorized_state`
      );
    }

    const tokens = await exchangeMPCode(code);

    const supabase = createServiceClient();
    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        mp_access_token: encrypt(tokens.access_token),
        mp_refresh_token: encrypt(tokens.refresh_token),
        mp_user_id: String(tokens.user_id),
        mp_connected_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateError) {
      console.error("[MP OAuth] Error guardando tokens:", updateError);
      return redirectWithMpCookieClear(
        `${appUrl}/dashboard/settings?mp_error=db_error`
      );
    }

    return redirectWithMpCookieClear(
      `${appUrl}/dashboard/settings?mp_success=true`
    );
  } catch (err) {
    console.error("[MP OAuth] Error intercambiando codigo:", err);
    return redirectWithMpCookieClear(
      `${appUrl}/dashboard/settings?mp_error=token_exchange_failed`
    );
  }
}
