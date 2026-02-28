import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/channel-adapters";
import type { SocialChannel } from "@/types";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const channelId = searchParams.get("channelId");
    const testPhone = searchParams.get("testPhone"); // Número a donde o desde donde enviar la prueba

    if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
    if (!testPhone) return NextResponse.json({ error: "Missing testPhone. Provee el ID de usuario de Messenger de prueba." }, { status: 400 });

    const ctx = await getAuthenticatedContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: channel } = await ctx.supabase
        .from("social_channels")
        .select("*")
        .eq("id", channelId)
        .eq("tenant_id", ctx.tenantId)
        .single();

    if (!channel || channel.channel_type !== "messenger") {
        return NextResponse.json({ error: "Canal Messenger no encontrado" }, { status: 404 });
    }

    const adapter = getAdapter("messenger");
    const results: any = {};

    try {
        // Forzar el envío de un mensaje de prueba simulando el tag ACCOUNT_UPDATE
        await adapter.sendReply(testPhone, "[META_TEST]", channel as SocialChannel);
        results.send_reply = { success: true, message: "Mensaje [META_TEST] enviado. Revisa tu Messenger." };
    } catch (e: any) {
        results.send_reply = { error: e.message };
    }

    // Esta llamada a la página en sí misma ya cuenta como actividad
    try {
        const token = channel.access_token;
        // Las Páginas no tienen campo email directo, así que pedimos informacion general de la página
        const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,emails,about&access_token=${token}`);
        results.read_page_info = await meRes.json();
    } catch (e: any) {
        results.read_page_info = { error: e.message };
    }

    return NextResponse.json({
        success: true,
        message: "Llamada de prueba de Messenger y lectura de Email realizada. Revisa Meta Developers.",
        results
    });
}
