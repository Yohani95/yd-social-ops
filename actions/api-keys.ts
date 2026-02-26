"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

export interface ApiKey {
    id: string;
    key_prefix: string;
    label: string;
    scopes: string[];
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
}

export interface ApiKeyWithSecret extends ApiKey {
    secret_key: string;
}

// En el navegador crypto de Node no está, usamos Web Crypto
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSecureToken(length = 32): string {
    const array = new Uint8Array(length);
    globalThis.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function listApiKeys(): Promise<ActionResult<ApiKey[]>> {
    const ctx = await getAuthenticatedContext();
    if (!ctx) return { success: false, error: "No autenticado" };

    const { data, error } = await ctx.supabase
        .from("api_keys")
        .select("id, key_prefix, label, scopes, is_active, last_used_at, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ApiKey[] };
}

export async function createApiKey(params: {
    label: string;
    scopes?: string[];
}): Promise<ActionResult<ApiKeyWithSecret>> {
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

    const label = params.label.trim();
    if (!label || label.length < 2) return { success: false, error: "Nombre requerido (mín. 2 caracteres)" };

    // Generar key: ydso_live_[prefix]_[secret]
    const prefix = generateSecureToken(4); // 8 chars
    const secret = generateSecureToken(16); // 32 chars
    const rawKey = `ydso_live_${prefix}_${secret}`;

    // Hashear para guardar en BD (nunca guardamos el secret original)
    const keyHash = await sha256(rawKey);

    const { data, error } = await ctx.supabase
        .from("api_keys")
        .insert({
            tenant_id: ctx.tenantId,
            key_hash: keyHash,
            key_prefix: `ydso_live_${prefix}`,
            label,
            scopes: params.scopes && params.scopes.length > 0 ? params.scopes : ["contacts:read", "messages:write"],
        })
        .select("id, key_prefix, label, scopes, is_active, last_used_at, created_at")
        .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/settings/api-keys");

    // Retornamos el secret SOLO ESTA VEZ
    return {
        success: true,
        data: {
            ...data,
            secret_key: rawKey
        } as ApiKeyWithSecret
    };
}

export async function revokeApiKey(id: string): Promise<ActionResult<null>> {
    const ctx = await getAuthenticatedContext();
    if (!ctx) return { success: false, error: "No autenticado" };

    // Revocar es más seguro que borrar
    const { error } = await ctx.supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/settings/api-keys");
    return { success: true, data: null };
}
