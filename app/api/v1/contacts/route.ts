import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
    // Autenticar la petición usando la llave API
    const auth = await authenticateApiRequest(req, "contacts:read");
    if (!auth.tenantId) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const search = searchParams.get("search");

    const supabase = createServiceClient();
    let query = supabase
        .from("contacts")
        .select("id, name, identifier, email, phone, channel, tags, created_at, last_seen_at, notes, metadata, lead_stage, lead_value, assigned_tenant_user_id, total_spent, last_interaction_at")
        .eq("tenant_id", auth.tenantId)
        .order("last_seen_at", { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

    if (search) {
        query = query.or(`name.ilike.%${search}%,identifier.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: "Database error", details: error }, { status: 500 });
    }

    return NextResponse.json({ data, meta: { limit, offset, count: data.length } });
}
