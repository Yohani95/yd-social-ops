"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import type { ActionResult, IntegrationProvider } from "@/types";

function normalizeProvider(provider: string): IntegrationProvider | null {
  if (provider === "resend" || provider === "n8n" || provider === "smtp" || provider === "gmail_oauth") return provider;
  return null;
}

function ensureHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

type IntegrationSettings = {
  resend: {
    is_active: boolean;
    from_email: string;
    has_api_key: boolean;
  };
  n8n: {
    is_active: boolean;
    webhook_url: string;
    has_auth_header: boolean;
  };
  smtp: {
    is_active: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from_email: string;
    has_password: boolean;
  };
  gmail_oauth: {
    is_active: boolean;
    email: string;
    has_refresh_token: boolean;
  };
};

const DEFAULT_SETTINGS: IntegrationSettings = {
  resend: { is_active: false, from_email: "", has_api_key: false },
  n8n: { is_active: false, webhook_url: "", has_auth_header: false },
  smtp: {
    is_active: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    from_email: "",
    has_password: false,
  },
  gmail_oauth: {
    is_active: false,
    email: "",
    has_refresh_token: false,
  },
};

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return DEFAULT_SETTINGS;

  const { data } = await ctx.supabase
    .from("tenant_integrations")
    .select("provider, is_active, config")
    .eq("tenant_id", ctx.tenantId)
    .in("provider", ["resend", "n8n", "smtp", "gmail_oauth"]);

  const settings: IntegrationSettings = {
    resend: { ...DEFAULT_SETTINGS.resend },
    n8n: { ...DEFAULT_SETTINGS.n8n },
    smtp: { ...DEFAULT_SETTINGS.smtp },
    gmail_oauth: { ...DEFAULT_SETTINGS.gmail_oauth },
  };

  for (const row of data || []) {
    const provider = normalizeProvider(String(row.provider || ""));
    if (!provider) continue;
    const config = (row.config || {}) as Record<string, unknown>;

    if (provider === "resend") {
      settings.resend.is_active = Boolean(row.is_active);
      settings.resend.from_email = typeof config.from_email === "string" ? config.from_email : "";
      settings.resend.has_api_key = Boolean(safeDecrypt(String(config.api_key_encrypted || "")) || config.api_key);
    }

    if (provider === "n8n") {
      settings.n8n.is_active = Boolean(row.is_active);
      settings.n8n.webhook_url =
        safeDecrypt(String(config.webhook_url_encrypted || "")) ||
        (typeof config.webhook_url === "string" ? config.webhook_url : "");
      settings.n8n.has_auth_header = Boolean(
        safeDecrypt(String(config.auth_header_encrypted || "")) || config.auth_header
      );
    }

    if (provider === "smtp") {
      settings.smtp.is_active = Boolean(row.is_active);
      settings.smtp.host = typeof config.host === "string" ? config.host : "";
      settings.smtp.port =
        typeof config.port === "number" && Number.isFinite(config.port)
          ? Math.max(1, Math.round(config.port))
          : 587;
      settings.smtp.secure = Boolean(config.secure);
      settings.smtp.user = typeof config.user === "string" ? config.user : "";
      settings.smtp.from_email = typeof config.from_email === "string" ? config.from_email : "";
      settings.smtp.has_password = Boolean(
        safeDecrypt(String(config.password_encrypted || "")) || config.password
      );
    }

    if (provider === "gmail_oauth") {
      settings.gmail_oauth.is_active = Boolean(row.is_active);
      settings.gmail_oauth.email = typeof config.email === "string" ? config.email : "";
      settings.gmail_oauth.has_refresh_token = Boolean(
        safeDecrypt(String(config.refresh_token_encrypted || "")) || config.refresh_token
      );
    }
  }

  return settings;
}

async function upsertProvider(
  provider: IntegrationProvider,
  isActive: boolean,
  config: Record<string, unknown>
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return { success: false, error: "Sin permisos" };
  }

  const { error } = await ctx.supabase
    .from("tenant_integrations")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        provider,
        is_active: isActive,
        config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,provider" }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function saveResendIntegration(params: {
  is_active: boolean;
  from_email: string;
  api_key?: string;
}): Promise<ActionResult> {
  const fromEmail = params.from_email.trim();
  if (params.is_active && !fromEmail) {
    return { success: false, error: "Email remitente requerido" };
  }

  const config: Record<string, unknown> = {
    from_email: fromEmail || "",
  };

  if (params.api_key?.trim()) {
    config.api_key_encrypted = encrypt(params.api_key.trim());
  }

  return upsertProvider("resend", params.is_active, config);
}

export async function saveN8nIntegration(params: {
  is_active: boolean;
  webhook_url: string;
  auth_header?: string;
}): Promise<ActionResult> {
  const webhookUrl = params.webhook_url.trim();
  if (params.is_active && !ensureHttpsUrl(webhookUrl)) {
    return { success: false, error: "Webhook URL invalida (requiere https)" };
  }

  const config: Record<string, unknown> = {
    webhook_url: webhookUrl || "",
  };

  if (params.auth_header?.trim()) {
    config.auth_header_encrypted = encrypt(params.auth_header.trim());
  }

  return upsertProvider("n8n", params.is_active, config);
}

export async function saveSmtpIntegration(params: {
  is_active: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_email: string;
  password?: string;
}): Promise<ActionResult> {
  const host = params.host.trim();
  const user = params.user.trim();
  const fromEmail = params.from_email.trim();
  const port = Number.isFinite(params.port) ? Math.max(1, Math.round(params.port)) : 587;

  if (params.is_active) {
    if (!host) return { success: false, error: "SMTP host requerido" };
    if (!user) return { success: false, error: "SMTP user requerido" };
    if (!fromEmail) return { success: false, error: "Email remitente requerido" };
  }

  const config: Record<string, unknown> = {
    host,
    port,
    secure: Boolean(params.secure),
    user,
    from_email: fromEmail,
  };

  if (params.password?.trim()) {
    config.password_encrypted = encrypt(params.password.trim());
  }

  return upsertProvider("smtp", params.is_active, config);
}

export async function disconnectGmailIntegration(): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return { success: false, error: "Sin permisos" };
  }

  const { error } = await ctx.supabase
    .from("tenant_integrations")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("provider", "gmail_oauth");

  if (error) return { success: false, error: error.message };
  return { success: true };
}
