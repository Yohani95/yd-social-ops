import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/cron/quality-evaluation
 *
 * Cron semanal: analiza bot_quality_events de los últimos 7 días,
 * detecta patrones de baja calidad y envía alertas al owner si aplica.
 *
 * Auth: CRON_SECRET en header Authorization: Bearer <secret>
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Traer métricas por tenant en la última semana
  const { data: events, error } = await supabase
    .from("bot_quality_events")
    .select("tenant_id, channel, is_repetition, is_fallback_response, response_latency_ms")
    .gte("created_at", weekAgo);

  if (error) {
    console.error("[CronQuality] Error leyendo eventos:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ success: true, data: { tenants_evaluated: 0 } });
  }

  // Agrupar por tenant
  const byTenant = new Map<string, typeof events>();
  for (const ev of events) {
    const list = byTenant.get(ev.tenant_id) ?? [];
    list.push(ev);
    byTenant.set(ev.tenant_id, list);
  }

  const alerts: { tenant_id: string; repetition_rate: number; fallback_rate: number }[] = [];

  for (const [tenantId, tenantEvents] of byTenant) {
    const total = tenantEvents.length;
    if (total < 10) continue; // no suficiente data

    const repetitionRate = tenantEvents.filter((e) => e.is_repetition).length / total;
    const fallbackRate = tenantEvents.filter((e) => e.is_fallback_response).length / total;

    const REPETITION_THRESHOLD = 0.20;
    const FALLBACK_THRESHOLD = 0.40;

    if (repetitionRate > REPETITION_THRESHOLD || fallbackRate > FALLBACK_THRESHOLD) {
      alerts.push({ tenant_id: tenantId, repetition_rate: repetitionRate, fallback_rate: fallbackRate });
      console.warn(
        `[CronQuality] Alerta tenant=${tenantId} repetition=${(repetitionRate * 100).toFixed(1)}% fallback=${(fallbackRate * 100).toFixed(1)}%`
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      tenants_evaluated: byTenant.size,
      alerts_generated: alerts.length,
      alerts,
    },
  });
}
