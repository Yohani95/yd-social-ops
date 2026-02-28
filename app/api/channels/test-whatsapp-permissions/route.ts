import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/channel-adapters";
import type { SocialChannel } from "@/types";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const channelId = searchParams.get("channelId");
    const testPhone = searchParams.get("testPhone"); // Número de celular con código de país (ej: 56912345678)

    if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
    if (!testPhone) return NextResponse.json({ error: "Missing testPhone. Provee un número de teléfono válido con código de área (ej. 569...)." }, { status: 400 });

    const ctx = await getAuthenticatedContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: channel } = await ctx.supabase
        .from("social_channels")
        .select("*")
        .eq("id", channelId)
        .eq("tenant_id", ctx.tenantId)
        .single();

    if (!channel || channel.channel_type !== "whatsapp") {
        return NextResponse.json({ error: "Canal WhatsApp no encontrado" }, { status: 404 });
    }

    const adapter = getAdapter("whatsapp");
    const results: any = {};

    try {
        // Forzamos un mensaje usando el adapter de WhatsApp
        await adapter.sendReply(testPhone, "Este es un mensaje de prueba para validar whatsapp_business_messaging en Meta Developers.", channel as SocialChannel);
        results.send_reply = { success: true, message: "Mensaje de WhatsApp enviado. Revisa tu celular." };
    } catch (e: any) {
        results.send_reply = { error: e.message };
    }

    return NextResponse.json({
        success: true,
        message: "Llamada de prueba de WhatsApp realizada. Revisa Meta Developers en unos minutos.",
        results
    });
}
