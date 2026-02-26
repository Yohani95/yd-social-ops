"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

export interface McpServer {
  id: string;
  name: string;
  url: string;
  auth_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listMcpServers(): Promise<ActionResult<McpServer[]>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data, error } = await ctx.supabase
    .from("mcp_servers")
    .select("id, name, url, auth_type, is_active, created_at, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as McpServer[] };
}

export async function createMcpServer(params: {
  name: string;
  url: string;
  auth_type: string;
  auth_secret?: string;
}): Promise<ActionResult<McpServer>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return { success: false, error: "Sin permisos" };
  }

  // Validate plan
  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("plan_tier")
    .eq("id", ctx.tenantId)
    .single();

  if (!tenant || !["enterprise", "enterprise_plus"].includes(tenant.plan_tier)) {
    return { success: false, error: "Requiere plan Enterprise o superior" };
  }

  const name = params.name.trim();
  const url = params.url.trim();
  if (!name || name.length < 2) return { success: false, error: "Nombre requerido (mín. 2 caracteres)" };
  if (!url || !url.startsWith("http")) return { success: false, error: "URL válida requerida" };

  const { data, error } = await ctx.supabase
    .from("mcp_servers")
    .insert({
      tenant_id: ctx.tenantId,
      name,
      url,
      auth_type: params.auth_type || "none",
      auth_secret: params.auth_secret || null,
    })
    .select("id, name, url, auth_type, is_active, created_at, updated_at")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings/mcp");
  return { success: true, data: data as McpServer };
}

export async function toggleMcpServer(id: string, isActive: boolean): Promise<ActionResult<null>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { error } = await ctx.supabase
    .from("mcp_servers")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings/mcp");
  return { success: true, data: null };
}

export async function deleteMcpServer(id: string): Promise<ActionResult<null>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { error } = await ctx.supabase
    .from("mcp_servers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings/mcp");
  return { success: true, data: null };
}
