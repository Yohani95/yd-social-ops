import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

/**
 * GET /api/bot/quality
 *
 * Retorna métricas de calidad del bot agregadas desde v_quality_metrics.
 * Query params:
 * - from: ISO date (default: 30 días atrás)
 * - to: ISO date (default: hoy)
 * - channel: 'web' | 'whatsapp' | ... (default: todos)
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const channelParam = searchParams.get("channel");

  const fromDate = fromParam
    ? new Date(fromParam).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = toParam ? new Date(toParam).toISOString() : new Date().toISOString();

  // Aggregate from bot_quality_events directly (view may not be accessible via RLS)
  let query = ctx.supabase
    .from("bot_quality_events")
    .select(
      "channel, intent_detected, provider_used, is_repetition, is_fallback_response, response_latency_ms, coherence_score, created_at"
    )
    .eq("tenant_id", ctx.tenantId)
    .gte("created_at", fromDate)
    .lte("created_at", toDate)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (channelParam) {
    query = query.eq("channel", channelParam);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        period_from: fromDate,
        period_to: toDate,
        channel: channelParam ?? "all",
        total_responses: 0,
        avg_latency_ms: null,
        p95_latency_ms: null,
        repetition_rate: 0,
        fallback_rate: 0,
        avg_coherence_score: null,
        intent_breakdown: {},
        provider_breakdown: {},
      },
    });
  }

  // Compute aggregates client-side
  const latencies = data
    .map((r) => r.response_latency_ms)
    .filter((v): v is number => v !== null && v !== undefined)
    .sort((a, b) => a - b);

  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
      : null;

  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies.length > 0 ? latencies[p95Index] ?? latencies.at(-1) : null;

  const repetitionCount = data.filter((r) => r.is_repetition).length;
  const fallbackCount = data.filter((r) => r.is_fallback_response).length;

  const coherenceValues = data
    .map((r) => r.coherence_score)
    .filter((v): v is number => v !== null && v !== undefined);
  const avgCoherence =
    coherenceValues.length > 0
      ? Math.round((coherenceValues.reduce((s, v) => s + v, 0) / coherenceValues.length) * 1000) / 1000
      : null;

  const intentBreakdown: Record<string, number> = {};
  for (const r of data) {
    const k = r.intent_detected ?? "unknown";
    intentBreakdown[k] = (intentBreakdown[k] ?? 0) + 1;
  }

  const providerBreakdown: Record<string, number> = {};
  for (const r of data) {
    const k = r.provider_used ?? "unknown";
    providerBreakdown[k] = (providerBreakdown[k] ?? 0) + 1;
  }

  // Per-channel aggregation
  const channelMap = new Map<string, typeof data>();
  for (const r of data) {
    const ch = r.channel ?? "unknown";
    const list = channelMap.get(ch) ?? [];
    list.push(r);
    channelMap.set(ch, list);
  }
  const byChannel = Array.from(channelMap.entries()).map(([ch, events]) => {
    const chLatencies = events
      .map((e) => e.response_latency_ms)
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b);
    return {
      channel: ch,
      total: events.length,
      repetition_rate: events.length > 0
        ? Math.round((events.filter((e) => e.is_repetition).length / events.length) * 10000) / 10000
        : 0,
      fallback_rate: events.length > 0
        ? Math.round((events.filter((e) => e.is_fallback_response).length / events.length) * 10000) / 10000
        : 0,
      avg_latency_ms: chLatencies.length > 0
        ? Math.round(chLatencies.reduce((s, v) => s + v, 0) / chLatencies.length)
        : 0,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      period_from: fromDate,
      period_to: toDate,
      channel: channelParam ?? "all",
      total_responses: data.length,
      avg_latency_ms: avgLatency,
      p95_latency_ms: p95Latency ?? null,
      repetition_rate:
        data.length > 0 ? Math.round((repetitionCount / data.length) * 10000) / 10000 : 0,
      fallback_rate:
        data.length > 0 ? Math.round((fallbackCount / data.length) * 10000) / 10000 : 0,
      avg_coherence_score: avgCoherence,
      intent_breakdown: intentBreakdown,
      provider_breakdown: providerBreakdown,
      by_channel: byChannel,
    },
  });
}
