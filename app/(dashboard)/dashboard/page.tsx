"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Package,
  Bot,
  Loader2,
  Users,
  Activity,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyBotUrlButton } from "@/components/dashboard/copy-bot-url-button";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { getDashboardStats, type DashboardStats } from "@/actions/dashboard";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const INTENT_COLORS: Record<string, string> = {
  purchase_intent: "#22c55e",
  inquiry: "#3b82f6",
  greeting: "#a855f7",
  complaint: "#ef4444",
  unknown: "#94a3b8",
};

const INTENT_LABELS: Record<string, string> = {
  purchase_intent: "Compra",
  inquiry: "Consulta",
  greeting: "Saludo",
  complaint: "Queja",
  unknown: "Otro",
};

const FUNNEL_COLORS = ["#3b82f6", "#22c55e", "#f59e0b"];

export default function DashboardPage() {
  const { tenant, tenantId } = useDashboard();
  const [stats, setStats] = useState<DashboardStats | undefined>(undefined);

  useEffect(() => {
    getDashboardStats()
      .then((s) =>
        setStats(
          s ?? {
            totalMessages: 0,
            purchaseIntents: 0,
            paymentLinksGenerated: 0,
            activeProducts: 0,
            totalProducts: 0,
            totalContacts: 0,
            messagesLast7Days: 0,
            messagesLast30Days: 0,
            channelBreakdown: [],
            messagesPerDay: [],
            intentBreakdown: [],
            conversionFunnel: [],
            recentLogs: [],
          }
        )
      )
      .catch(() =>
        setStats({
          totalMessages: 0,
          purchaseIntents: 0,
          paymentLinksGenerated: 0,
          activeProducts: 0,
          totalProducts: 0,
          totalContacts: 0,
          messagesLast7Days: 0,
          messagesLast30Days: 0,
          channelBreakdown: [],
          messagesPerDay: [],
          intentBreakdown: [],
          conversionFunnel: [],
          recentLogs: [],
        })
      );
  }, []);

  if (stats === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statCards = [
    {
      title: "Mensajes totales",
      value: stats.totalMessages,
      icon: MessageSquare,
      description: "Conversaciones del bot",
    },
    {
      title: "Intenciones de compra",
      value: stats.purchaseIntents,
      icon: ShoppingCart,
      description: "Clientes interesados",
    },
    {
      title: "Links de pago",
      value: stats.paymentLinksGenerated,
      icon: TrendingUp,
      description: "Generados automáticamente",
    },
    {
      title: "Productos activos",
      value: stats.activeProducts,
      icon: Package,
      description: `de ${stats.totalProducts} en total`,
    },
    {
      title: "Contactos CRM",
      value: stats.totalContacts,
      icon: Users,
      description: "Capturados por el bot",
    },
    {
      title: "Últimos 7 días",
      value: stats.messagesLast7Days,
      icon: Activity,
      description: "Mensajes esta semana",
    },
  ];

  // Format dates for chart axis
  const chartData = stats.messagesPerDay.map((d) => ({
    ...d,
    label: new Date(d.date + "T12:00:00").toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    }),
  }));

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold truncate">
          Hola, {tenant?.name || "Vendedor"} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Aquí está el resumen de tu bot de ventas
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-5 h-5 text-primary shrink-0" />
              <CardTitle className="text-base truncate">URL de tu Bot</CardTitle>
            </div>
            <Badge variant="success" className="self-start sm:ml-auto shrink-0">
              {tenant?.plan_tier?.toUpperCase() || "BASIC"}
            </Badge>
          </div>
          <CardDescription>
            Integra esta URL en WhatsApp, Instagram o cualquier canal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyBotUrlButton tenantId={tenantId} />
        </CardContent>
      </Card>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Area Chart — Messages per Day (30 days) */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Mensajes últimos 30 días
            </CardTitle>
            <CardDescription>
              Actividad diaria del bot con intenciones de compra
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradientMsg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientInt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradientMsg)"
                    name="Mensajes"
                  />
                  <Area
                    type="monotone"
                    dataKey="intents"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#gradientInt)"
                    name="Compra"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Sin datos todavía
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart — Intent Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Intenciones detectadas</CardTitle>
            <CardDescription>Distribución por tipo</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.intentBreakdown.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.intentBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="count"
                      nameKey="intent"
                      strokeWidth={2}
                      stroke="hsl(var(--card))"
                    >
                      {stats.intentBreakdown.map((entry) => (
                        <Cell
                          key={entry.intent}
                          fill={INTENT_COLORS[entry.intent] || "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      formatter={(value: any, name: any) => [
                        value,
                        INTENT_LABELS[name] || name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center">
                  {stats.intentBreakdown.map((entry) => (
                    <div key={entry.intent} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            INTENT_COLORS[entry.intent] || "#94a3b8",
                        }}
                      />
                      <span className="text-muted-foreground">
                        {INTENT_LABELS[entry.intent] || entry.intent}
                      </span>
                      <span className="font-medium">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Sin datos todavía
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      {stats.conversionFunnel.some((s) => s.value > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Embudo de conversión</CardTitle>
            <CardDescription>
              Desde primer mensaje hasta generación de link de pago
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={stats.conversionFunnel}
                layout="vertical"
                margin={{ left: 100 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fontSize: 13, fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} name="Cantidad">
                  {stats.conversionFunnel.map((_, index) => (
                    <Cell key={index} fill={FUNNEL_COLORS[index] || "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {stats.totalMessages > 0 && (
              <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground justify-center">
                <span>
                  Tasa de interés:{" "}
                  <strong className="text-foreground">
                    {Math.round(
                      (stats.purchaseIntents / stats.totalMessages) * 100
                    )}
                    %
                  </strong>
                </span>
                <span>
                  Tasa de conversión:{" "}
                  <strong className="text-foreground">
                    {stats.purchaseIntents > 0
                      ? Math.round(
                        (stats.paymentLinksGenerated /
                          stats.purchaseIntents) *
                        100
                      )
                      : 0}
                    %
                  </strong>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Channel Breakdown */}
      {stats.channelBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mensajes por canal</CardTitle>
            <CardDescription>Distribución de conversaciones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.channelBreakdown.map((ch) => {
                const pct =
                  stats.totalMessages > 0
                    ? Math.round((ch.count / stats.totalMessages) * 100)
                    : 0;
                const channelLabels: Record<string, string> = {
                  web: "Web Widget",
                  whatsapp: "WhatsApp",
                  messenger: "Messenger",
                  instagram: "Instagram",
                  tiktok: "TikTok",
                };
                return (
                  <div key={ch.channel} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {channelLabels[ch.channel] || ch.channel}
                      </span>
                      <span className="text-muted-foreground">
                        {ch.count} msgs · {ch.intents} intenciones · {ch.payments}{" "}
                        pagos
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Conversaciones recientes</CardTitle>
          <CardDescription>Últimas interacciones del bot</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay conversaciones aún</p>
              <p className="text-xs mt-1">
                Integra el bot para empezar a recibir mensajes
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {log.user_message}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      Bot: {log.bot_response}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge
                      variant={
                        log.intent_detected === "purchase_intent"
                          ? "success"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {log.intent_detected || "inquiry"}
                    </Badge>
                    {log.payment_link && (
                      <Badge variant="default" className="text-[10px]">
                        Pago generado
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
