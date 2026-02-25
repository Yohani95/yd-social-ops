"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Package,
  Bot,
  Loader2,
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

export default function DashboardPage() {
  const { tenant, tenantId } = useDashboard();
  const [stats, setStats] = useState<DashboardStats | undefined>(undefined);

  useEffect(() => {
    getDashboardStats()
      .then((s) => setStats(s ?? {
        totalMessages: 0,
        purchaseIntents: 0,
        paymentLinksGenerated: 0,
        activeProducts: 0,
        totalProducts: 0,
        recentLogs: [],
      }))
      .catch(() => setStats({
        totalMessages: 0,
        purchaseIntents: 0,
        paymentLinksGenerated: 0,
        activeProducts: 0,
        totalProducts: 0,
        recentLogs: [],
      }));
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
  ];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
