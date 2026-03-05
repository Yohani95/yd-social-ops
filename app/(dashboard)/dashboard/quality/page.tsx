"use client";

import { useEffect, useState } from "react";
import {
  BarChart2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  MessageSquare,
  Zap,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type QualityMetrics = {
  total_responses: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  repetition_rate: number;
  fallback_rate: number;
  intent_breakdown: Record<string, number>;
  avg_coherence_score: number | null;
  by_channel: {
    channel: string;
    total: number;
    repetition_rate: number;
    fallback_rate: number;
    avg_latency_ms: number;
  }[];
};

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web Widget",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const INTENT_LABELS: Record<string, string> = {
  purchase_intent: "Compra",
  inquiry: "Consulta",
  complaint: "Queja",
  greeting: "Saludo",
  unknown: "Sin detectar",
};

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  status,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  status?: "ok" | "warn" | "bad" | "neutral";
}) {
  const statusColor = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
    neutral: "text-foreground",
  }[status ?? "neutral"];

  const StatusIcon =
    status === "ok" ? CheckCircle2 :
    status === "warn" ? AlertTriangle :
    status === "bad" ? AlertTriangle :
    Minus;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        {status && status !== "neutral" && (
          <StatusIcon className={`w-4 h-4 ${statusColor}`} />
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${statusColor}`}>{value}</p>
        {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}

function RateBar({ value, label, warnAt, badAt }: { value: number; label: string; warnAt: number; badAt: number }) {
  const pct = Math.min(value * 100, 100);
  const color =
    value >= badAt ? "bg-red-500" :
    value >= warnAt ? "bg-amber-500" :
    "bg-emerald-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${
          value >= badAt ? "text-red-600 dark:text-red-400" :
          value >= warnAt ? "text-amber-600 dark:text-amber-400" :
          "text-emerald-600 dark:text-emerald-400"
        }`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function QualityPage() {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("all");
  const [range, setRange] = useState("7d");

  const ranges: Record<string, { from: string }> = {
    "1d": { from: new Date(Date.now() - 86_400_000).toISOString() },
    "7d": { from: new Date(Date.now() - 7 * 86_400_000).toISOString() },
    "30d": { from: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  };

  async function fetchMetrics() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("from", ranges[range].from);
      if (channel !== "all") params.set("channel", channel);
      const res = await fetch(`/api/bot/quality?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.data ?? null);
      } else {
        toast.error("Error al cargar métricas");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, range]);

  const latencyStatus =
    !metrics ? "neutral" :
    metrics.avg_latency_ms > 5000 ? "bad" :
    metrics.avg_latency_ms > 3000 ? "warn" : "ok";

  const repetitionStatus =
    !metrics ? "neutral" :
    metrics.repetition_rate > 0.20 ? "bad" :
    metrics.repetition_rate > 0.10 ? "warn" : "ok";

  const fallbackStatus =
    !metrics ? "neutral" :
    metrics.fallback_rate > 0.40 ? "bad" :
    metrics.fallback_rate > 0.20 ? "warn" : "ok";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            Métricas de Calidad
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Monitoreo de rendimiento y calidad de respuestas del bot
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="1d">Últimas 24h</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </select>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos los canales</option>
            {Object.entries(CHANNEL_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <Button variant="outline" size="icon" onClick={fetchMetrics} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Calculando métricas...</p>
          </div>
        </div>
      ) : !metrics || metrics.total_responses === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-2xl bg-muted/20">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <BarChart2 className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <h3 className="font-semibold">Sin datos en este período</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            Las métricas se registran automáticamente cuando el bot responde mensajes.
            Activa el flag <strong>quality_tracking_enabled</strong> en Configuración → Bot.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Respuestas totales"
              value={metrics.total_responses.toLocaleString()}
              icon={MessageSquare}
              status="neutral"
            />
            <MetricCard
              label="Latencia promedio"
              value={`${(metrics.avg_latency_ms / 1000).toFixed(1)}s`}
              subtext={`P95: ${(metrics.p95_latency_ms / 1000).toFixed(1)}s`}
              icon={Clock}
              status={latencyStatus}
            />
            <MetricCard
              label="Tasa de repetición"
              value={`${(metrics.repetition_rate * 100).toFixed(1)}%`}
              subtext="Umbral: 20%"
              icon={Zap}
              status={repetitionStatus}
            />
            <MetricCard
              label="Tasa de fallback"
              value={`${(metrics.fallback_rate * 100).toFixed(1)}%`}
              subtext="Umbral: 40%"
              icon={Shield}
              status={fallbackStatus}
            />
          </div>

          {/* Health alerts */}
          {(repetitionStatus === "bad" || fallbackStatus === "bad" || latencyStatus === "bad") && (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Atención requerida</p>
                <ul className="text-xs text-red-600 dark:text-red-400 mt-1 space-y-0.5 list-disc list-inside">
                  {repetitionStatus === "bad" && <li>Tasa de repetición alta — el bot puede estar en bucle</li>}
                  {fallbackStatus === "bad" && <li>Muchas respuestas de fallback — revisar prompts o base de conocimiento</li>}
                  {latencyStatus === "bad" && <li>Latencia alta — posible sobrecarga del proveedor AI</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Rate bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Tasas de calidad</CardTitle>
                <CardDescription className="text-xs">Ideal: repetición &lt;10%, fallback &lt;20%</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RateBar value={metrics.repetition_rate} label="Repetición" warnAt={0.10} badAt={0.20} />
                <RateBar value={metrics.fallback_rate} label="Fallback (proveedor secundario)" warnAt={0.20} badAt={0.40} />
                {metrics.avg_coherence_score !== null && (
                  <RateBar
                    value={1 - (metrics.avg_coherence_score ?? 0)}
                    label="Incoherencia estimada"
                    warnAt={0.15}
                    badAt={0.30}
                  />
                )}
              </CardContent>
            </Card>

            {/* Intent breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Distribución de intenciones</CardTitle>
                <CardDescription className="text-xs">Qué tipo de mensajes recibe el bot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(metrics.intent_breakdown).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin datos de intención</p>
                ) : (
                  Object.entries(metrics.intent_breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([intent, count]) => {
                      const total = Object.values(metrics.intent_breakdown).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div key={intent} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-24 shrink-0">
                            {INTENT_LABELS[intent] || intent}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-12 text-right">{count}</span>
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-channel breakdown */}
          {metrics.by_channel.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Por canal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border/50">
                  {metrics.by_channel.map((ch) => (
                    <div key={ch.channel} className="py-3 flex items-center gap-4">
                      <span className="w-24 text-sm font-medium shrink-0">
                        {CHANNEL_LABELS[ch.channel] || ch.channel}
                      </span>
                      <div className="flex flex-wrap gap-2 flex-1">
                        <Badge variant="secondary" className="text-[11px]">
                          {ch.total} resp.
                        </Badge>
                        <Badge
                          variant={ch.repetition_rate > 0.20 ? "destructive" : ch.repetition_rate > 0.10 ? "warning" : "secondary"}
                          className="text-[11px]"
                        >
                          Rep: {(ch.repetition_rate * 100).toFixed(0)}%
                        </Badge>
                        <Badge
                          variant={ch.fallback_rate > 0.40 ? "destructive" : ch.fallback_rate > 0.20 ? "warning" : "secondary"}
                          className="text-[11px]"
                        >
                          Fallback: {(ch.fallback_rate * 100).toFixed(0)}%
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          <Clock className="w-2.5 h-2.5 mr-1" />
                          {(ch.avg_latency_ms / 1000).toFixed(1)}s
                        </Badge>
                      </div>
                      {ch.repetition_rate > 0.20 || ch.fallback_rate > 0.40 ? (
                        <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                      ) : ch.repetition_rate < 0.05 && ch.fallback_rate < 0.10 ? (
                        <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
