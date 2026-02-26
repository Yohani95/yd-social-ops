"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  MessageSquare,
  Bot,
  User,
  ExternalLink,
  Loader2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { getChatLogs, type ChatLogFilters } from "@/actions/chat-logs";
import type { ChatLog } from "@/types";
import {
  WhatsAppIcon,
  MessengerIcon,
  InstagramIcon,
  TikTokIcon,
} from "@/components/ui/social-icons";

const intentLabels: Record<string, string> = {
  purchase_intent: "Compra",
  inquiry: "Consulta",
  greeting: "Saludo",
  complaint: "Queja",
  unknown: "Desconocido",
};

const intentVariants: Record<
  string,
  "success" | "default" | "secondary" | "warning" | "destructive"
> = {
  purchase_intent: "success",
  inquiry: "secondary",
  greeting: "default",
  complaint: "destructive",
  unknown: "secondary",
};

const channelConfig: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  web: {
    label: "Web",
    icon: <Globe className="w-3.5 h-3.5" />,
    color: "text-violet-600",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: <WhatsAppIcon size={14} className="text-green-600" />,
    color: "text-green-600",
  },
  messenger: {
    label: "Messenger",
    icon: <MessengerIcon size={14} className="text-blue-600" />,
    color: "text-blue-600",
  },
  instagram: {
    label: "Instagram",
    icon: <InstagramIcon size={14} className="text-pink-600" />,
    color: "text-pink-600",
  },
  tiktok: {
    label: "TikTok",
    icon: <TikTokIcon size={14} className="text-foreground" />,
    color: "text-foreground",
  },
};

const PAGE_SIZE = 50;

interface SessionGroup {
  sessionId: string;
  logs: ChatLog[];
  channel: string;
  firstDate: string;
  lastDate: string;
  intents: string[];
  hasPayment: boolean;
}

export default function ChatLogsPage() {
  const [logs, setLogs] = useState<ChatLog[] | undefined>(undefined);
  const [channel, setChannel] = useState("all");
  const [intent, setIntent] = useState("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set()
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchLogs = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      const newOffset = reset ? 0 : offset;
      const filters: ChatLogFilters = {
        channel: channel !== "all" ? channel : undefined,
        intent: intent !== "all" ? intent : undefined,
        search: searchDebounced || undefined,
        offset: newOffset,
        limit: PAGE_SIZE,
      };

      try {
        const result = await getChatLogs(filters);
        if (reset) {
          setLogs(result);
          setOffset(result.length);
        } else {
          setLogs((prev) => [...(prev || []), ...result]);
          setOffset(newOffset + result.length);
        }
        setHasMore(result.length === PAGE_SIZE);
      } catch {
        if (reset) setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [channel, intent, searchDebounced, offset]
  );

  // Reset on filter change
  useEffect(() => {
    fetchLogs(true);
    setExpandedSessions(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, intent, searchDebounced]);

  // Group logs by session
  const sessionGroups: SessionGroup[] = useMemo(() => {
    if (!logs) return [];

    const grouped = new Map<string, ChatLog[]>();
    const noSession: ChatLog[] = [];

    for (const log of logs) {
      const key = log.session_id;
      if (!key) {
        noSession.push(log);
        continue;
      }
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(log);
    }

    const groups: SessionGroup[] = [];

    for (const [sessionId, sessionLogs] of grouped) {
      const sorted = sessionLogs.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      groups.push({
        sessionId,
        logs: sorted,
        channel: sorted[0].channel,
        firstDate: sorted[0].created_at,
        lastDate: sorted[sorted.length - 1].created_at,
        intents: sorted
          .map((l) => l.intent_detected)
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i) as string[],
        hasPayment: sorted.some((l) => !!l.payment_link),
      });
    }

    // Sort groups by most recent message desc
    groups.sort(
      (a, b) =>
        new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
    );

    // Add individual (sessionless) logs as 1-entry groups
    for (const log of noSession) {
      groups.push({
        sessionId: log.id,
        logs: [log],
        channel: log.channel,
        firstDate: log.created_at,
        lastDate: log.created_at,
        intents: log.intent_detected ? [log.intent_detected] : [],
        hasPayment: !!log.payment_link,
      });
    }

    return groups;
  }, [logs]);

  const toggleSession = (id: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (logs === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
          <span className="truncate">Chat Logs</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Historial de conversaciones del bot
          {logs.length > 0 && ` — ${logs.length} mensajes`}
          {sessionGroups.length > 0 &&
            ` en ${sessionGroups.length} conversaciones`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en mensajes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="all">Todos los canales</option>
            <option value="web">🌐 Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>

        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          className="text-sm border rounded-md px-2 py-1.5 bg-background"
        >
          <option value="all">Todos los intents</option>
          <option value="purchase_intent">🛒 Compra</option>
          <option value="inquiry">💬 Consulta</option>
          <option value="greeting">👋 Saludo</option>
          <option value="complaint">⚠️ Queja</option>
          <option value="unknown">❓ Desconocido</option>
        </select>
      </div>

      {/* Content */}
      {sessionGroups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {search || channel !== "all" || intent !== "all"
              ? "No hay resultados para estos filtros"
              : "No hay conversaciones aún"}
          </p>
          <p className="text-sm mt-1">
            {search || channel !== "all" || intent !== "all"
              ? "Intenta con otros filtros o busca algo diferente"
              : "Los mensajes del bot aparecerán aquí automáticamente"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessionGroups.map((group) => {
            const isExpanded = expandedSessions.has(group.sessionId);
            const isSingleMessage = group.logs.length === 1;
            const ch =
              channelConfig[group.channel] || channelConfig.web;

            return (
              <Card key={group.sessionId}>
                {/* Session Header — clickable to expand */}
                <CardHeader
                  className={`pb-2 ${!isSingleMessage ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                  onClick={
                    !isSingleMessage
                      ? () => toggleSession(group.sessionId)
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Channel icon */}
                      <Badge
                        variant="outline"
                        className={`text-xs gap-1 ${ch.color}`}
                      >
                        {ch.icon}
                        {ch.label}
                      </Badge>

                      {/* Intents */}
                      {group.intents.map((i) => (
                        <Badge
                          key={i}
                          variant={intentVariants[i] || "secondary"}
                          className="text-xs"
                        >
                          {intentLabels[i] || i}
                        </Badge>
                      ))}

                      {group.hasPayment && (
                        <Badge variant="success" className="text-xs">
                          Pago generado
                        </Badge>
                      )}

                      {!isSingleMessage && (
                        <Badge variant="outline" className="text-xs">
                          {group.logs.length} mensajes
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <CardDescription className="text-xs">
                        {formatDate(group.lastDate)}
                      </CardDescription>
                      {!isSingleMessage &&
                        (isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ))}
                    </div>
                  </div>
                </CardHeader>

                {/* Messages */}
                <CardContent className="space-y-2">
                  {(isSingleMessage || isExpanded
                    ? group.logs
                    : group.logs.slice(-1)
                  ).map((log, idx) => (
                    <div
                      key={log.id}
                      className={
                        idx > 0
                          ? "pt-2 border-t border-border/50"
                          : ""
                      }
                    >
                      {!isSingleMessage && isExpanded && (
                        <p className="text-[10px] text-muted-foreground mb-1">
                          {formatDate(log.created_at)}
                          {log.user_identifier &&
                            ` · ${log.user_identifier}`}
                        </p>
                      )}
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-sm">{log.user_message}</p>
                      </div>
                      <div className="flex items-start gap-2 mt-1">
                        <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground">
                          {log.bot_response}
                        </p>
                      </div>
                      {log.payment_link && (
                        <div className="pt-1 pl-6">
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
                    </div>
                  ))}

                  {/* "Show more" hint when collapsed */}
                  {!isSingleMessage && !isExpanded && (
                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                      Mostrando último mensaje ·{" "}
                      <button
                        onClick={() => toggleSession(group.sessionId)}
                        className="text-primary hover:underline"
                      >
                        Ver conversación completa ({group.logs.length}{" "}
                        mensajes)
                      </button>
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs(false)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Cargar más conversaciones
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
