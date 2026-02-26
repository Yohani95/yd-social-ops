import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
    // Autenticar la petición usando la llave API
    const auth = await authenticateApiRequest(req, "messages:write"); // scope write porque lee y escribe
    if (!auth.tenantId) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const channel = searchParams.get("channel");

    const supabase = createServiceClient();
    let query = supabase
        .from("chat_logs")
        .select("id, session_id, user_message, bot_response, intent_detected, channel, user_identifier, created_at")
        .eq("tenant_id", auth.tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (channel) {
        query = query.eq("channel", channel);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: "Database error", details: error }, { status: 500 });
    }

    return NextResponse.json({ data, count: data.length });
}
