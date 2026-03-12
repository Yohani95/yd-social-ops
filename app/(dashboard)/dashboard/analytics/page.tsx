"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyticsActorType } from "@/types";

interface Metrics {
  period_from: string;
  period_to: string;
  total_conversations_started: number;
  total_lead_stage_changes: number;
  total_payments_completed: number;
  conversion_rate: number;
  sales_by_channel: Array<{ channel: string; amount: number; count: number }>;
  sales_by_product: Array<{ product_id: string; amount: number; count: number }>;
  sales_by_actor: Array<{ actor_type: AnalyticsActorType; amount: number; count: number }>;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ConversionAnalyticsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function loadMetrics() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/analytics/conversion${query}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: Metrics };
      setMetrics(json.data || null);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRevenue = useMemo(
    () => (metrics?.sales_by_channel || []).reduce((acc, item) => acc + Number(item.amount || 0), 0),
    [metrics]
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Analytics de conversión
          </h1>
          <p className="text-sm text-muted-foreground">
            Ventas por canal, producto y actor (bot vs humano).
          </p>
        </div>
        <Button variant="outline" onClick={loadMetrics}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refrescar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtro de período</CardTitle>
          <CardDescription>Opcional. Si no eliges fechas, usa los últimos 30 días.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="from-date" className="text-sm font-medium">Desde</label>
            <Input id="from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="to-date" className="text-sm font-medium">Hasta</label>
            <Input id="to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={loadMetrics} className="w-full">Aplicar</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Cargando métricas...</CardContent>
        </Card>
      ) : !metrics ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">No hay métricas disponibles.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Conversaciones iniciadas</CardDescription>
                <CardTitle>{metrics.total_conversations_started}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pagos completados</CardDescription>
                <CardTitle>{metrics.total_payments_completed}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Conversion rate</CardDescription>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {formatPercent(metrics.conversion_rate)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Revenue total</CardDescription>
                <CardTitle>{formatMoney(totalRevenue)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Ventas por canal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(metrics.sales_by_channel || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  metrics.sales_by_channel.map((item) => (
                    <div key={item.channel} className="rounded-md border p-2 text-sm flex justify-between gap-2">
                      <span>{item.channel}</span>
                      <span className="font-medium">{formatMoney(item.amount)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Ventas por producto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(metrics.sales_by_product || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  metrics.sales_by_product.map((item) => (
                    <div key={item.product_id} className="rounded-md border p-2 text-sm flex justify-between gap-2">
                      <span className="truncate">{item.product_id}</span>
                      <span className="font-medium">{formatMoney(item.amount)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Bot vs Humano</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(metrics.sales_by_actor || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  metrics.sales_by_actor.map((item) => (
                    <div key={item.actor_type} className="rounded-md border p-2 text-sm flex justify-between gap-2">
                      <span>{item.actor_type}</span>
                      <span className="font-medium">{formatMoney(item.amount)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
