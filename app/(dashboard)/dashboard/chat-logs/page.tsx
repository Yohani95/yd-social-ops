"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Bot, User, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { getChatLogs } from "@/actions/chat-logs";
import type { ChatLog } from "@/types";

const intentLabels: Record<string, string> = {
  purchase_intent: "Compra",
  inquiry: "Consulta",
  greeting: "Saludo",
  complaint: "Queja",
  unknown: "Desconocido",
};

const intentVariants: Record<string, "success" | "default" | "secondary" | "warning" | "destructive"> = {
  purchase_intent: "success",
  inquiry: "secondary",
  greeting: "default",
  complaint: "destructive",
  unknown: "secondary",
};

const channelLabels: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export default function ChatLogsPage() {
  const [logs, setLogs] = useState<ChatLog[] | undefined>(undefined);

  useEffect(() => {
    getChatLogs(50).then((l) => setLogs(l || [])).catch(() => setLogs([]));
  }, []);

  if (logs === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          Chat Logs
        </h1>
        <p className="text-muted-foreground mt-1">
          Historial de conversaciones del bot
          {logs.length > 0 && ` — ${logs.length} mensajes recientes`}
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay conversaciones aún</p>
          <p className="text-sm mt-1">
            Los mensajes del bot aparecerán aquí automáticamente
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {channelLabels[log.channel] || log.channel}
                    </Badge>
                    <Badge
                      variant={(log.intent_detected && intentVariants[log.intent_detected]) || "secondary"}
                      className="text-xs"
                    >
                      {(log.intent_detected && intentLabels[log.intent_detected]) || log.intent_detected || "—"}
                    </Badge>
                    {log.payment_link && (
                      <Badge variant="success" className="text-xs">
                        Pago generado
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {log.created_at ? formatDate(log.created_at) : "—"}
                    {log.user_identifier && ` · ${log.user_identifier}`}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm">{log.user_message}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{log.bot_response}</p>
                </div>
                {log.payment_link && (
                  <div className="pt-1">
                    <a
                      href={log.payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver link de pago
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
