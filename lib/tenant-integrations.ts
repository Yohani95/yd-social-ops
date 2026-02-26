import { createServiceClient } from "@/lib/supabase/server";
import { safeDecrypt } from "@/lib/encryption";
import type { IntegrationProvider } from "@/types";

type TenantIntegrationRow = {
  provider: IntegrationProvider;
  is_active: boolean;
  config: Record<string, unknown> | null;
};

async function getTenantIntegrationRow(
  tenantId: string,
  provider: IntegrationProvider
): Promise<TenantIntegrationRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("provider, is_active, config")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;
  return data as TenantIntegrationRow;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function getResendRuntimeConfig(tenantId?: string): Promise<{
  apiKey: string | null;
  fromEmail: string | null;
  source: "tenant" | "global" | "none";
}> {
  if (tenantId) {
    const row = await getTenantIntegrationRow(tenantId, "resend");
    if (row?.is_active) {
      const cfg = (row.config || {}) as Record<string, unknown>;
      const apiKeyEncrypted = asString(cfg.api_key_encrypted);
      const apiKeyPlain = asString(cfg.api_key);
      const apiKey = safeDecrypt(apiKeyEncrypted) || apiKeyPlain;
      const fromEmail = asString(cfg.from_email);

      if (apiKey && fromEmail) {
        return { apiKey, fromEmail, source: "tenant" };
      }
    }
  }

  const globalApiKey = asString(process.env.RESEND_API_KEY);
  const globalFrom = asString(process.env.EMAIL_FROM);
  if (globalApiKey && globalFrom) {
    return { apiKey: globalApiKey, fromEmail: globalFrom, source: "global" };
  }

  return { apiKey: null, fromEmail: null, source: "none" };
}

export async function getSmtpRuntimeConfig(tenantId?: string): Promise<{
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromEmail: string | null;
  source: "tenant" | "none";
}> {
  if (!tenantId) {
    return {
      host: null,
      port: 587,
      secure: false,
      user: null,
      password: null,
      fromEmail: null,
      source: "none",
    };
  }

  const row = await getTenantIntegrationRow(tenantId, "smtp");
  if (!row?.is_active) {
    return {
      host: null,
      port: 587,
      secure: false,
      user: null,
      password: null,
      fromEmail: null,
      source: "none",
    };
  }

  const cfg = (row.config || {}) as Record<string, unknown>;
  const host = asString(cfg.host);
  const user = asString(cfg.user);
  const fromEmail = asString(cfg.from_email);
  const passwordEncrypted = asString(cfg.password_encrypted);
  const passwordPlain = asString(cfg.password);
  const password = safeDecrypt(passwordEncrypted) || passwordPlain;
  const secure = Boolean(cfg.secure);
  const port =
    typeof cfg.port === "number" && Number.isFinite(cfg.port)
      ? Math.max(1, Math.round(cfg.port))
      : 587;

  if (host && user && password && fromEmail) {
    return {
      host,
      port,
      secure,
      user,
      password,
      fromEmail,
      source: "tenant",
    };
  }

  return {
    host: null,
    port: 587,
    secure: false,
    user: null,
    password: null,
    fromEmail: null,
    source: "none",
  };
}

export async function getGmailOAuthRuntimeConfig(tenantId?: string): Promise<{
  userEmail: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  source: "tenant" | "none";
}> {
  if (!tenantId) {
    return {
      userEmail: null,
      refreshToken: null,
      clientId: null,
      clientSecret: null,
      source: "none",
    };
  }

  const row = await getTenantIntegrationRow(tenantId, "gmail_oauth");
  if (!row?.is_active) {
    return {
      userEmail: null,
      refreshToken: null,
      clientId: null,
      clientSecret: null,
      source: "none",
    };
  }

  const cfg = (row.config || {}) as Record<string, unknown>;
  const userEmail = asString(cfg.email);
  const refreshTokenEncrypted = asString(cfg.refresh_token_encrypted);
  const refreshTokenPlain = asString(cfg.refresh_token);
  const refreshToken = safeDecrypt(refreshTokenEncrypted) || refreshTokenPlain;
  const clientId = asString(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = asString(process.env.GOOGLE_CLIENT_SECRET);

  if (userEmail && refreshToken && clientId && clientSecret) {
    return {
      userEmail,
      refreshToken,
      clientId,
      clientSecret,
      source: "tenant",
    };
  }

  return {
    userEmail: null,
    refreshToken: null,
    clientId,
    clientSecret,
    source: "none",
  };
}

export async function getTenantEmailRuntime(tenantId?: string): Promise<
  | {
      provider: "gmail_oauth";
      userEmail: string;
      refreshToken: string;
      clientId: string;
      clientSecret: string;
      fromEmail: string;
      source: "tenant";
    }
  | {
      provider: "smtp";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
      fromEmail: string;
      source: "tenant";
    }
  | {
      provider: "resend";
      apiKey: string;
      fromEmail: string;
      source: "tenant" | "global";
    }
  | {
      provider: null;
      source: "none";
    }
> {
  const gmail = await getGmailOAuthRuntimeConfig(tenantId);
  if (
    gmail.source === "tenant" &&
    gmail.userEmail &&
    gmail.refreshToken &&
    gmail.clientId &&
    gmail.clientSecret
  ) {
    return {
      provider: "gmail_oauth",
      userEmail: gmail.userEmail,
      refreshToken: gmail.refreshToken,
      clientId: gmail.clientId,
      clientSecret: gmail.clientSecret,
      fromEmail: gmail.userEmail,
      source: "tenant",
    };
  }

  const smtp = await getSmtpRuntimeConfig(tenantId);
  if (
    smtp.source === "tenant" &&
    smtp.host &&
    smtp.user &&
    smtp.password &&
    smtp.fromEmail
  ) {
    return {
      provider: "smtp",
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      password: smtp.password,
      fromEmail: smtp.fromEmail,
      source: "tenant",
    };
  }

  const resend = await getResendRuntimeConfig(tenantId);
  if (resend.apiKey && resend.fromEmail) {
    const source = resend.source === "global" ? "global" : "tenant";
    return {
      provider: "resend",
      apiKey: resend.apiKey,
      fromEmail: resend.fromEmail,
      source,
    };
  }

  return { provider: null, source: "none" };
}

export async function getN8nRuntimeConfig(tenantId?: string): Promise<{
  webhookUrl: string | null;
  authHeader: string | null;
  source: "tenant" | "global" | "none";
}> {
  if (tenantId) {
    const row = await getTenantIntegrationRow(tenantId, "n8n");
    if (row?.is_active) {
      const cfg = (row.config || {}) as Record<string, unknown>;
      const webhookEncrypted = asString(cfg.webhook_url_encrypted);
      const webhookPlain = asString(cfg.webhook_url);
      const webhookUrl = safeDecrypt(webhookEncrypted) || webhookPlain;

      const authEncrypted = asString(cfg.auth_header_encrypted);
      const authPlain = asString(cfg.auth_header);
      const authHeader = safeDecrypt(authEncrypted) || authPlain;

      if (webhookUrl) {
        return { webhookUrl, authHeader, source: "tenant" };
      }
    }
  }

  const globalWebhook = asString(process.env.N8N_WEBHOOK_URL);
  if (globalWebhook) {
    return { webhookUrl: globalWebhook, authHeader: null, source: "global" };
  }

  return { webhookUrl: null, authHeader: null, source: "none" };
}
