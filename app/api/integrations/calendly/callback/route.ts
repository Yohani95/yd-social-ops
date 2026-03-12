import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://social.yd-engineering.cl";

/**
 * GET /api/integrations/calendly/callback
 *
 * Recibe el authorization code de Calendly, lo intercambia por
 * access_token + refresh_token y guarda ambos cifrados en DB.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&calendly_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&calendly_error=missing_params`
    );
  }

  // Decodificar state → tenantId:timestamp
  let tenantId: string;
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [tid, tsStr] = decoded.split(":");
    if (!tid || !tsStr) throw new Error("invalid state");
    const ts = parseInt(tsStr, 10);
    // Rechazar states de más de 10 minutos
    if (Date.now() - ts > 10 * 60 * 1000) throw new Error("state expired");
    tenantId = tid;
  } catch {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&calendly_error=invalid_state`
    );
  }

  // Intercambiar code por tokens
  const clientId     = process.env.CALENDLY_CLIENT_ID!;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET!;
  const redirectUri  = process.env.CALENDLY_REDIRECT_URI ||
    "https://social.yd-engineering.cl/api/integrations/calendly/callback";

  let tokenData: {
    access_token:  string;
    refresh_token: string;
    token_type:    string;
    expires_in:    number;
    created_at:    number;
  };

  try {
    const res = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[calendly/callback] token exchange error:", err);
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?tab=integrations&calendly_error=token_exchange`
      );
    }

    tokenData = await res.json();
  } catch (err) {
    console.error("[calendly/callback] fetch error:", err);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&calendly_error=network`
    );
  }

  // Calcular expiración — Calendly puede omitir created_at
  const baseTs = tokenData.created_at ? tokenData.created_at * 1000 : Date.now();
  const expiresAt = new Date(baseTs + (tokenData.expires_in ?? 7200) * 1000).toISOString();

  // Obtener info del usuario para verificar y guardar
  let userUri = "";
  try {
    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json() as { resource: { uri: string } };
      userUri = me.resource.uri;
    }
  } catch {
    // no crítico
  }

  // Guardar en DB cifrado
  const supabase = createServiceClient();
  const { error: dbError } = await supabase
    .from("tenant_scheduling_configs")
    .upsert(
      {
        tenant_id:        tenantId,
        provider:         "calendly",
        access_token:     encrypt(tokenData.access_token),
        refresh_token:    tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        token_expires_at: expiresAt,
        event_type_uri:   null,   // el usuario puede configurarlo después
        timezone:         "America/Santiago",
        is_active:        true,
        updated_at:       new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );

  if (dbError) {
    console.error("[calendly/callback] DB error:", dbError);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&calendly_error=db`
    );
  }

  console.info(`[calendly/callback] OAuth success for tenant ${tenantId}, user ${userUri}`);

  return NextResponse.redirect(
    `${APP_URL}/dashboard/settings?tab=integrations&calendly_success=true`
  );
}
