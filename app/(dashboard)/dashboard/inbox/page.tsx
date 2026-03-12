"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import {
  Inbox,
  Loader2,
  Search,
  Send,
  Filter,
  MessageSquare,
  Globe,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { WhatsAppIcon, MessengerIcon, InstagramIcon, TikTokIcon } from "@/components/ui/social-icons";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { DashboardModuleHeader } from "@/components/dashboard/module-header";
import { MemberSelect } from "@/components/dashboard/member-select";
import type {
  ChatChannel,
  ConversationMessage,
  ConversationThread,
  LeadStage,
  OffsetPagination,
  ThreadStatus,
} from "@/types";

const THREADS_PAGE_SIZE = 50;
const MESSAGES_PAGE_SIZE = 50;

const CHANNEL_OPTIONS: Array<{ value: "all" | ChatChannel; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "web", label: "Web" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

const STATUS_OPTIONS: Array<{ value: "all" | ThreadStatus; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

const LEAD_STAGE_OPTIONS: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "interested",
  "checkout",
  "customer",
  "lost",
];

const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  interested: "Interesado",
  checkout: "Checkout",
  customer: "Cliente",
  lost: "Perdido",
};

function channelLabel(channel: ChatChannel): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "messenger") return "Messenger";
  if (channel === "instagram") return "Instagram";
  if (channel === "tiktok") return "TikTok";
  return "Web";
}

function channelIcon(channel: ChatChannel) {
  if (channel === "whatsapp") return <WhatsAppIcon size={14} className="text-green-600" />;
  if (channel === "messenger") return <MessengerIcon size={14} className="text-blue-600" />;
  if (channel === "instagram") return <InstagramIcon size={14} className="text-pink-600" />;
  if (channel === "tiktok") return <TikTokIcon size={14} className="text-foreground" />;
  return <Globe className="w-3.5 h-3.5 text-violet-600" />;
}

function statusVariant(status: ThreadStatus): "secondary" | "warning" | "success" {
  if (status === "open") return "success";
  if (status === "pending") return "warning";
  return "secondary";
}

const URL_REGEX = /(https?:\/\/[^\s,)>\]"]+)/g;

function renderContent(text: string) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer"
        className="underline text-primary break-all hover:opacity-80">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

export default function InboxPage() {
  const { userRole } = useDashboard();
  const isOwner = userRole === "owner";
  const [threads, setThreads] = useState<ConversationThread[] | undefined>(undefined);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[] | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<"all" | ChatChannel>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ThreadStatus>("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [replyText, setReplyText] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [threadsOffset, setThreadsOffset] = useState(0);
  const [threadsHasMore, setThreadsHasMore] = useState(false);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [leadStage, setLeadStage] = useState<LeadStage>("new");
  const [leadValue, setLeadValue] = useState("0");
  const [assignedTenantUserId, setAssignedTenantUserId] = useState("");
  const [updatingLead, setUpdatingLead] = useState(false);

  function threadMatchesFilters(thread: ConversationThread): boolean {
    if (channelFilter !== "all" && thread.channel !== channelFilter) return false;
    if (statusFilter !== "all" && thread.status !== statusFilter) return false;
    if (searchDebounced && !thread.user_identifier.toLowerCase().includes(searchDebounced.toLowerCase())) return false;
    return true;
  }

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  async function loadThreads(reset = false) {
    if (reset) {
      setLoadingThreads(true);
    } else {
      setLoadingMoreThreads(true);
    }

    try {
      const nextOffset = reset ? 0 : threadsOffset;
      const params = new URLSearchParams();
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchDebounced) params.set("search", searchDebounced);
      params.set("limit", String(THREADS_PAGE_SIZE));
      params.set("offset", String(nextOffset));

      const res = await fetch(`/api/inbox/threads?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as {
        data?: ConversationThread[];
        pagination?: OffsetPagination;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "No se pudo cargar la bandeja");
      }

      const receivedThreads = data.data || [];
      const pagination = data.pagination;

      if (reset) {
        setThreads(receivedThreads);
      } else {
        setThreads((prev) => {
          const current = prev || [];
          const merged = [...current, ...receivedThreads];
          const uniqueById = new Map<string, ConversationThread>();
          for (const thread of merged) uniqueById.set(thread.id, thread);
          return Array.from(uniqueById.values());
        });
      }

      setThreadsHasMore(Boolean(pagination?.has_more));
      setThreadsOffset(pagination?.next_offset ?? nextOffset + receivedThreads.length);

      const effectiveThreads = reset
        ? receivedThreads
        : [...(threads || []), ...receivedThreads];

      if (!effectiveThreads.length) {
        setSelectedThreadId(null);
        setMessages([]);
        setMessagesHasMore(false);
        setMessagesOffset(0);
        return;
      }

      if (!selectedThreadId || !effectiveThreads.some((t) => t.id === selectedThreadId)) {
        setSelectedThreadId(effectiveThreads[0].id);
      }
    } catch (error) {
      setThreads([]);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la bandeja");
    } finally {
      if (reset) {
        setLoadingThreads(false);
      } else {
        setLoadingMoreThreads(false);
      }
    }
  }

  async function loadMessages(threadId: string, reset = false) {
    if (reset) {
      setLoadingMessages(true);
    } else {
      setLoadingMoreMessages(true);
    }

    try {
      const nextOffset = reset ? 0 : messagesOffset;
      const params = new URLSearchParams();
      params.set("limit", String(MESSAGES_PAGE_SIZE));
      params.set("offset", String(nextOffset));

      const res = await fetch(`/api/inbox/threads/${threadId}/messages?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as {
        data?: { messages?: ConversationMessage[] };
        pagination?: OffsetPagination;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "No se pudo cargar la conversacion");
      }

      const nextMessages = data.data?.messages || [];
      const pagination = data.pagination;

      if (reset) {
        setMessages(nextMessages);
      } else {
        setMessages((prev) => [...nextMessages, ...(prev || [])]);
      }

      setMessagesHasMore(Boolean(pagination?.has_more));
      setMessagesOffset(pagination?.next_offset ?? nextOffset + nextMessages.length);
    } catch (error) {
      setMessages([]);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la conversacion");
    } finally {
      if (reset) {
        setLoadingMessages(false);
      } else {
        setLoadingMoreMessages(false);
      }
    }
  }

  useEffect(() => {
    setThreadsOffset(0);
    setThreadsHasMore(false);
    void loadThreads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, statusFilter, searchDebounced]);

  useEffect(() => {
    if (!selectedThreadId) return;
    setMessagesOffset(0);
    setMessagesHasMore(false);
    void loadMessages(selectedThreadId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  const selectedThread = useMemo(
    () => threads?.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  useEffect(() => {
    if (!selectedThread) return;
    setLeadStage((selectedThread.lead_stage_snapshot || "new") as LeadStage);
    setLeadValue(String(selectedThread.lead_value_snapshot ?? 0));
    setAssignedTenantUserId(selectedThread.assigned_tenant_user_id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread?.id]);

  async function handleStatusChange(status: ThreadStatus) {
    if (!selectedThread) return;

    const res = await fetch(`/api/inbox/threads/${selectedThread.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const data = (await res.json()) as { error?: string };

    if (!res.ok) {
      toast.error(data.error || "No se pudo actualizar estado");
      return;
    }

    toast.success("Estado actualizado");
    await loadThreads(true);
  }

  async function handleLeadUpdate() {
    if (!selectedThread) return;
    setUpdatingLead(true);
    try {
      const res = await fetch(`/api/inbox/threads/${selectedThread.id}/lead`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_stage: leadStage,
          lead_value: Number(leadValue || 0),
          assigned_tenant_user_id: assignedTenantUserId.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string; data?: ConversationThread };
      if (!res.ok) {
        throw new Error(data.error || "No se pudo actualizar lead");
      }
      if (data.data) {
        setThreads((prev) => (prev || []).map((thread) => (thread.id === data.data!.id ? data.data! : thread)));
      }
      toast.success("Lead actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar lead");
    } finally {
      setUpdatingLead(false);
    }
  }

  async function handleReply() {
    if (!selectedThread || !replyText.trim()) return;
    const content = replyText.trim();
    const optimisticId = `optimistic:${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticMessage: ConversationMessage = {
      id: optimisticId,
      thread_id: selectedThread.id,
      tenant_id: selectedThread.tenant_id,
      direction: "outbound",
      author_type: "agent",
      content,
      provider_message_id: null,
      raw_payload: { source: "inbox_optimistic" },
      created_at: optimisticCreatedAt,
    };

    setReplyText("");
    setMessages((prev) => [...(prev || []), optimisticMessage]);
    setSendingReply(true);

    try {
      const res = await fetch(`/api/inbox/threads/${selectedThread.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const data = (await res.json()) as {
        error?: string;
        data?: {
          thread?: ConversationThread;
          message?: ConversationMessage;
        };
      };
      if (!res.ok) {
        throw new Error(data.error || "No se pudo enviar la respuesta");
      }

      const persistedThread = data.data?.thread;
      const persistedMessage = data.data?.message;

      if (persistedMessage) {
        setMessages((prev) => (prev || []).map((msg) => (msg.id === optimisticId ? persistedMessage : msg)));
      } else {
        setMessages((prev) => (prev || []).filter((msg) => msg.id !== optimisticId));
      }

      if (persistedThread) {
        const includeInCurrentList = threadMatchesFilters(persistedThread);
        setThreads((prev) => {
          if (!prev) return prev;
          const rest = prev.filter((thread) => thread.id !== persistedThread.id);
          return includeInCurrentList ? [persistedThread, ...rest] : rest;
        });

        if (!includeInCurrentList) {
          const fallbackThread = (threads || []).find((thread) => thread.id !== persistedThread.id) || null;
          setSelectedThreadId(fallbackThread?.id || null);
          if (!fallbackThread) setMessages([]);
        }
      }

      toast.success("Respuesta enviada");
    } catch (error) {
      setMessages((prev) => (prev || []).filter((msg) => msg.id !== optimisticId));
      setReplyText(content);
      toast.error(error instanceof Error ? error.message : "No se pudo enviar la respuesta");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleBackfillFromChatLogs() {
    if (backfilling) return;
    setBackfilling(true);

    try {
      const res = await fetch("/api/inbox/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_rows: 10000 }),
      });

      const result = (await res.json()) as {
        error?: string;
        data?: {
          processed_logs: number;
          inserted_messages: number;
          skipped_messages: number;
          errors: number;
        };
      };

      if (!res.ok) {
        throw new Error(result.error || "No se pudo importar historial");
      }

      const summary = result.data;
      toast.success(
        `Importacion completa: ${summary?.processed_logs || 0} logs, ${summary?.inserted_messages || 0} mensajes nuevos, ${summary?.skipped_messages || 0} omitidos`
      );

      await loadThreads(true);
      if (selectedThreadId) {
        await loadMessages(selectedThreadId, true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo importar historial");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleLoadMoreThreads() {
    if (loadingThreads || loadingMoreThreads || !threadsHasMore) return;
    await loadThreads(false);
  }

  async function handleLoadOlderMessages() {
    if (!selectedThreadId || loadingMessages || loadingMoreMessages || !messagesHasMore) return;
    await loadMessages(selectedThreadId, false);
  }

  if (threads === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardModuleHeader
        domain="inbox"
        icon={Inbox}
        title="Bandeja omnicanal"
        description="Conversaciones unificadas por canal con filtros rapidos, CRM operativo y respuesta manual."
        meta={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {threads.length} conversaciones
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              {selectedThreadId ? "Thread activo" : "Sin seleccion"}
            </Badge>
          </div>
        )}
        actions={isOwner ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleBackfillFromChatLogs()}
            disabled={backfilling}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${backfilling ? "animate-spin" : ""}`} />
            Importar historial desde Chat Logs
          </Button>
        ) : null}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className={`xl:col-span-1 yd-surface-transition ${selectedThreadId ? "hidden xl:block" : ""}`}>
          <CardHeader>
            <CardTitle className="text-base">Threads</CardTitle>
            <CardDescription>{threads.length} conversaciones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por identificador"
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Canal</p>
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value as "all" | ChatChannel)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | ThreadStatus)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="border rounded-md divide-y max-h-[560px] overflow-y-auto">
              {loadingThreads ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                </div>
              ) : threads.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No hay conversaciones</div>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${selectedThreadId === thread.id ? "bg-muted" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      {channelIcon(thread.channel)}
                      <p className="text-sm font-medium truncate">{thread.user_identifier}</p>
                      {thread.unread_count > 0 ? (
                        <Badge variant="destructive" className="ml-auto">{thread.unread_count}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={statusVariant(thread.status)}>{thread.status}</Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {new Date(thread.last_message_at).toLocaleString("es-CL")}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
            {threadsHasMore ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMoreThreads}
                onClick={() => void handleLoadMoreThreads()}
              >
                {loadingMoreThreads ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Cargar más conversaciones
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className={`xl:col-span-2 yd-surface-transition ${!selectedThreadId ? "hidden xl:block" : ""}`}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <button
                type="button"
                className="xl:hidden p-1 -ml-1 rounded-md hover:bg-muted transition-colors"
                onClick={() => setSelectedThreadId(null)}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <MessageSquare className="w-4 h-4" />
              {selectedThread ? selectedThread.user_identifier : "Selecciona una conversacion"}
            </CardTitle>
            {selectedThread ? (
              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                <Badge variant="outline">{channelLabel(selectedThread.channel)}</Badge>
                <Badge variant={statusVariant(selectedThread.status)}>{selectedThread.status}</Badge>
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{new Date(selectedThread.last_message_at).toLocaleString("es-CL")}</span>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!selectedThread} onClick={() => void handleStatusChange("open")}>
                Open
              </Button>
              <Button variant="outline" size="sm" disabled={!selectedThread} onClick={() => void handleStatusChange("pending")}>
                Pending
              </Button>
              <Button variant="outline" size="sm" disabled={!selectedThread} onClick={() => void handleStatusChange("closed")}>
                Closed
              </Button>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Perfil CRM</p>
              <div className="grid sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="lead-stage">Etapa del lead</label>
                  <select
                    id="lead-stage"
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={leadStage}
                    onChange={(e) => setLeadStage(e.target.value as LeadStage)}
                    disabled={!selectedThread}
                  >
                    {LEAD_STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>{LEAD_STAGE_LABELS[stage]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="lead-value">Valor del lead</label>
                  <Input
                    id="lead-value"
                    value={leadValue}
                    onChange={(e) => setLeadValue(e.target.value)}
                    placeholder="0"
                    disabled={!selectedThread}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="assigned-user">Agente asignado</label>
                  <MemberSelect
                    id="assigned-user"
                    value={assignedTenantUserId}
                    onChange={setAssignedTenantUserId}
                    disabled={!selectedThread}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => void handleLeadUpdate()} disabled={!selectedThread || updatingLead}>
                  {updatingLead ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Guardar perfil CRM
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {messagesHasMore && selectedThread ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={loadingMoreMessages}
                  onClick={() => void handleLoadOlderMessages()}
                >
                  {loadingMoreMessages ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Ver mensajes anteriores
                </Button>
              ) : null}

              <div className="border rounded-md p-3 h-[300px] sm:h-[420px] overflow-y-auto space-y-3">
              {!selectedThread ? (
                <p className="text-sm text-muted-foreground">Selecciona una conversacion para ver mensajes.</p>
              ) : loadingMessages || messages === undefined ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando mensajes...
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aun no hay mensajes en este thread.</p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-primary/10" : "bg-muted"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">
                        {message.author_type}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(message.created_at).toLocaleString("es-CL")}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{renderContent(message.content)}</p>
                  </div>
                ))
              )}
              </div>
            </div>

            <div className="space-y-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={selectedThread ? "Escribe tu respuesta manual..." : "Selecciona una conversacion"}
                disabled={!selectedThread || sendingReply}
                rows={3}
                className="min-h-[44px]"
              />
              <div className="flex justify-end">
                <Button onClick={() => void handleReply()} disabled={!selectedThread || sendingReply || !replyText.trim()}>
                  {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar respuesta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
