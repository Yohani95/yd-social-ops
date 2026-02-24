import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  const { tenant_id } = await params;

  const supabase = createServiceClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("bot_name, bot_welcome_message, business_name")
    .eq("id", tenant_id)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    bot_name: tenant.bot_name || "Asistente",
    welcome_message: tenant.bot_welcome_message || "¡Hola! ¿En qué puedo ayudarte?",
    business_name: tenant.business_name || "",
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
  });
}
