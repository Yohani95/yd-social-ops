import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { safeDecrypt } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";

/**
 * Crea un cliente MP con el access token del TENANT.
 * Usado para crear preferencias de pago en nombre del vendedor.
 */
export function getMPClient(encryptedAccessToken: string): MercadoPagoConfig {
  const accessToken = safeDecrypt(encryptedAccessToken);
  if (!accessToken) {
    throw new Error("Token de Mercado Pago del tenant inválido o no configurado");
  }
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
}

/**
 * Crea un cliente MP con TU access token personal.
 * Usado para cobrar la suscripción del SaaS a tus clientes.
 */
export function getSaaSMPClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MP_ACCESS_TOKEN no está configurado en variables de entorno");
  }
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
}

/**
 * Genera la URL de autorización OAuth de Mercado Pago
 * para conectar la cuenta del vendedor (Plan Pro/Enterprise).
 */
export function getMPOAuthUrl(tenantId: string): string {
  const clientId = process.env.MP_CLIENT_ID;
  const appUrl = getAppUrl("");

  if (!clientId || !appUrl) {
    throw new Error("MP_CLIENT_ID o APP_URL no estan configurados");
  }

  const redirectUri = `${appUrl}/api/auth/mercadopago/callback`;
  const state = Buffer.from(JSON.stringify({ tenant_id: tenantId })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: redirectUri,
    state,
  });

  return `https://auth.mercadopago.cl/authorization?${params.toString()}`;
}

/**
 * Intercambia el authorization code por tokens OAuth.
 */
export async function exchangeMPCode(
  code: string
): Promise<{
  access_token: string;
  refresh_token: string;
  user_id: number;
}> {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${getAppUrl()}/api/auth/mercadopago/callback`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al intercambiar código MP: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Re-exportar clases de MP para uso en Server Actions
export { Preference, Payment };

