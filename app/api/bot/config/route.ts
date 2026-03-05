import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { TenantBotConfig } from "@/types";

const DEFAULT_CONFIG: Omit<TenantBotConfig, "id" | "tenant_id" | "created_at" | "updated_at"> = {
  default_tone: "amigable",
  max_response_chars_by_channel: {},
  coherence_window_turns: 10,
  repetition_guard_enabled: true,
  fallback_to_human_enabled: false,
  fallback_confidence_threshold: 0.4,
  sensitive_topics_policy: "moderate",
  channel_overrides: {},
  feature_flags: {},
};

/**
 * GET /api/bot/config
 * Retorna la config avanzada del bot del tenant autenticado.
 * Si no existe, retorna defaults sin crear registro.
 */
export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await ctx.supabase
    .from("tenant_bot_configs")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      success: true,
      data: { ...DEFAULT_CONFIG, tenant_id: ctx.tenantId },
    });
  }

  return NextResponse.json({ success: true, data });
}

/**
 * PUT /api/bot/config
 * Upsert de la configuración avanzada del bot.
 * Valida rangos y tipos antes de persistir.
 */
export async function PUT(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  let body: Partial<typeof DEFAULT_CONFIG>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  // Validaciones
  const errors: string[] = [];

  if (body.fallback_confidence_threshold !== undefined) {
    const v = Number(body.fallback_confidence_threshold);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      errors.push("fallback_confidence_threshold debe estar entre 0 y 1");
    }
  }

  if (body.coherence_window_turns !== undefined) {
    const v = Number(body.coherence_window_turns);
    if (!Number.isInteger(v) || v < 1 || v > 40) {
      errors.push("coherence_window_turns debe ser entero entre 1 y 40");
    }
  }

  if (body.max_response_chars_by_channel) {
    for (const [ch, val] of Object.entries(body.max_response_chars_by_channel)) {
      if (typeof val !== "number" || val < 1) {
        errors.push(`max_response_chars_by_channel.${ch} debe ser número > 0`);
      }
    }
  }

  if (
    body.default_tone !== undefined &&
    !["formal", "informal", "amigable"].includes(body.default_tone)
  ) {
    errors.push("default_tone debe ser 'formal', 'informal' o 'amigable'");
  }

  if (
    body.sensitive_topics_policy !== undefined &&
    !["strict", "moderate", "relaxed"].includes(body.sensitive_topics_policy)
  ) {
    errors.push("sensitive_topics_policy debe ser 'strict', 'moderate' o 'relaxed'");
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, error: errors.join("; ") }, { status: 422 });
  }

  const payload = {
    tenant_id: ctx.tenantId,
    ...body,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("tenant_bot_configs")
    .upsert(payload, { onConflict: "tenant_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
