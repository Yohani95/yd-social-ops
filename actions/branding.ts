"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

export interface BrandingParams {
    name: string;
    logo: string;
    primaryColor: string;
}

export async function updateBranding(params: BrandingParams): Promise<ActionResult<null>> {
    const ctx = await getAuthenticatedContext();
    if (!ctx) return { success: false, error: "No autenticado" };
    if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
        return { success: false, error: "Sin permisos" };
    }

    // Verificar plan
    const { data: tenant } = await ctx.supabase
        .from("tenants")
        .select("plan_tier")
        .eq("id", ctx.tenantId)
        .single();

    if (!tenant || !["enterprise", "enterprise_plus"].includes(tenant.plan_tier)) {
        return { success: false, error: "El White-label requiere plan Enterprise o superior" };
    }

    const { error } = await ctx.supabase
        .from("tenants")
        .update({
            white_label_name: params.name || null,
            white_label_logo: params.logo || null,
            white_label_primary_color: params.primaryColor || "#3b82f6"
        })
        .eq("id", ctx.tenantId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/", "layout"); // Revalida todo el dashboard (layout)
    return { success: true, data: null };
}
