import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

/**
 * GET /api/integrations/calendly/auth
 *
 * Inicia el flujo OAuth 2.0 con Calendly.
 * Genera un state firmado con tenantId y redirige a la pantalla de autorización.
 */
export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "https://social.yd-engineering.cl")
    );
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "CALENDLY_CLIENT_ID no configurado" }, { status: 500 });
  }

  const redirectUri = process.env.CALENDLY_REDIRECT_URI ||
    "https://social.yd-engineering.cl/api/integrations/calendly/callback";

  // State = base64(tenantId:timestamp) — verificado en callback
  const state = Buffer.from(`${ctx.tenantId}:${Date.now()}`).toString("base64url");

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    state,
  });

  const authUrl = `https://auth.calendly.com/oauth/authorize?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
