import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Reutilizamos la función sha256
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ApiAuthResult {
    tenantId: string | null;
    error?: string;
    status?: number;
}

export async function authenticateApiRequest(req: NextRequest, requiredScope: string): Promise<ApiAuthResult> {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ydso_live_")) {
        return { tenantId: null, error: "Missing or invalid Authorization header", status: 401 };
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await sha256(token);

    const supabase = createServiceClient();

    // Buscar token hasheado
    const { data: apiKey, error } = await supabase
        .from("api_keys")
        .select("id, tenant_id, is_active, scopes")
        .eq("key_hash", tokenHash)
        .single();

    if (error || !apiKey) {
        return { tenantId: null, error: "Invalid API key", status: 401 };
    }

    if (!apiKey.is_active) {
        return { tenantId: null, error: "API key is revoked or inactive", status: 403 };
    }

    if (!apiKey.scopes.includes(requiredScope) && !apiKey.scopes.includes("all")) {
        return { tenantId: null, error: `Insufficient permissions. Requires scope: ${requiredScope}`, status: 403 };
    }

    // Update last_used_at flag async sin bloquear
    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id).then();

    return { tenantId: apiKey.tenant_id };
}
