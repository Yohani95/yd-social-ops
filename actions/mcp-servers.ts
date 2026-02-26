"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import type { ActionResult, McpAuthType, McpServer } from "@/types";

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getMcpServers(): Promise<McpServer[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const { data, error } = await ctx.supabase
    .from("mcp_servers")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data as McpServer[]) || [];
}

export async function createMcpServer(params: {
  name: string;
  url: string;
  auth_type: McpAuthType;
  auth_secret?: string;
}): Promise<ActionResult<McpServer>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos" };

  const name = params.name.trim();
  const url = params.url.trim();
  if (!name) return { success: false, error: "Nombre requerido" };
  if (!isValidUrl(url)) return { success: false, error: "URL invalida" };

  const authSecret =
    params.auth_type === "none"
      ? null
      : params.auth_secret?.trim()
        ? encrypt(params.auth_secret.trim())
        : null;

  const { data, error } = await ctx.supabase
    .from("mcp_servers")
    .insert({
      tenant_id: ctx.tenantId,
      name,
      url,
      auth_type: params.auth_type,
      auth_secret: authSecret,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as McpServer };
}

export async function updateMcpServer(
  serverId: string,
  updates: {
    name?: string;
    url?: string;
    auth_type?: McpAuthType;
    auth_secret?: string;
    is_active?: boolean;
  }
): Promise<ActionResult<McpServer>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos" };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof updates.name === "string") {
    const name = updates.name.trim();
    if (!name) return { success: false, error: "Nombre invalido" };
    payload.name = name;
  }

  if (typeof updates.url === "string") {
    const url = updates.url.trim();
    if (!isValidUrl(url)) return { success: false, error: "URL invalida" };
    payload.url = url;
  }

  if (typeof updates.auth_type === "string") payload.auth_type = updates.auth_type;
  if (typeof updates.is_active === "boolean") payload.is_active = updates.is_active;

  if (typeof updates.auth_secret === "string") {
    payload.auth_secret = updates.auth_secret.trim() ? encrypt(updates.auth_secret.trim()) : null;
  }

  const { data, error } = await ctx.supabase
    .from("mcp_servers")
    .update(payload)
    .eq("id", serverId)
    .eq("tenant_id", ctx.tenantId)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as McpServer };
}

export async function deleteMcpServer(serverId: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner") return { success: false, error: "Sin permisos" };

  const { error } = await ctx.supabase
    .from("mcp_servers")
    .delete()
    .eq("id", serverId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
