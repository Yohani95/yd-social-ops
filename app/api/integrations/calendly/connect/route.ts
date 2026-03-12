import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext, createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { CalendlyAdapter } from "@/lib/scheduling/calendly";

/**
 * POST /api/integrations/calendly/connect
 *
 * Conecta Calendly al tenant usando Personal Access Token.
 * Valida el token antes de guardar.
 *
 * Body: { access_token, event_type_uri?, timezone? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { access_token, event_type_uri, timezone } = body;

    if (!access_token) {
      return NextResponse.json(
        { success: false, error: "access_token es requerido" },
        { status: 400 }
      );
    }

    // Validar token obteniendo datos del usuario
    let userUri: string;
    try {
      const res = await fetch("https://api.calendly.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { resource: { uri: string; name: string } };
      userUri = data.resource.uri;
    } catch {
      return NextResponse.json(
        { success: false, error: "Token de Calendly inválido o sin acceso" },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("tenant_scheduling_configs")
      .upsert(
        {
          tenant_id:      ctx.tenantId,
          provider:       "calendly",
          access_token:   encrypt(access_token),
          event_type_uri: event_type_uri || null,
          timezone:       timezone || "America/Santiago",
          is_active:      true,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

    if (error) {
      console.error("[calendly/connect] upsert error:", error);
      return NextResponse.json(
        { success: false, error: "Error guardando configuración" },
        { status: 500 }
      );
    }

    // Obtener próximos slots disponibles para verificar
    const adapter = new CalendlyAdapter(
      access_token,
      event_type_uri || null,
      timezone || "America/Santiago"
    );
    const slots = await adapter.getAvailability(3);

    return NextResponse.json({
      success: true,
      data: {
        user_uri:          userUri,
        available_slots:   slots.length,
        next_slot:         slots[0]?.startTime || null,
      },
    });
  } catch (err) {
    console.error("[calendly/connect] error:", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("tenant_scheduling_configs")
      .select("id, provider, event_type_uri, timezone, is_active, created_at")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    return NextResponse.json({ success: true, data: data || null });
  } catch (err) {
    console.error("[calendly/connect] GET error:", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
