import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exchangeMPCode } from "@/lib/mercadopago";
import { encrypt } from "@/lib/encryption";

/**
 * GET /api/auth/mercadopago/callback
 *
 * Recibe el callback de Mercado Pago OAuth.
 * Intercambia el code por tokens y los guarda en la BD.
 *
 * Query params: code, state (base64url del tenant_id)
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Manejar errores de MP OAuth
  if (error) {
    console.error("[MP OAuth] Error recibido de MP:", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?mp_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?mp_error=missing_params`
    );
  }

  // Decodificar el state para obtener tenant_id
  let tenantId: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    );
    tenantId = decoded.tenant_id;

    if (!tenantId) throw new Error("tenant_id no encontrado en state");
  } catch {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?mp_error=invalid_state`
    );
  }

  try {
    // Intercambiar código por tokens
    const tokens = await exchangeMPCode(code);

    // Cifrar y guardar tokens en Supabase con Service Role (bypass RLS)
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
      return NextResponse.redirect(
        `${appUrl}/dashboard/settings?mp_error=db_error`
      );
    }

    // Redirigir con éxito
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?mp_success=true`
    );
  } catch (err) {
    console.error("[MP OAuth] Error intercambiando código:", err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?mp_error=token_exchange_failed`
    );
  }
}
