"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CircleDashed,
  Megaphone,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Target,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ChannelInlineList, ChannelSelectChip } from "@/components/dashboard/channel-meta";
import { SetupRequiredState } from "@/components/dashboard/setup-required-state";
import { formatDate, truncate } from "@/lib/utils";
import type {
  Campaign,
  CampaignExecutionSummary,
  CampaignStatus,
  ChatChannel,
  SetupRequiredApiResponse,
} from "@/types";

const CHANNELS: ChatChannel[] = ["web", "whatsapp", "messenger", "instagram", "tiktok"];
const STATUS_FILTERS: Array<{ value: "all" | CampaignStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Borrador" },
  { value: "scheduled", label: "Programadas" },
  { value: "running", label: "En curso" },
  { value: "completed", label: "Completadas" },
  { value: "cancelled", label: "Canceladas" },
];

function isBetaChannel(channel: ChatChannel): boolean {
  return channel === "instagram" || channel === "messenger";
}

interface CampaignStats {
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  replied: number;
  by_channel?: Array<{
    channel: ChatChannel;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
  }>;
  recent_failures?: Array<{
    channel: ChatChannel;
    error: string | null;
    updated_at: string;
    contact_identifier: string | null;
    contact_name: string | null;
  }>;
  summary?: CampaignExecutionSummary;
}

interface SetupState {
  module: string;
  message?: string;
  migrationFile?: string;
  planRequired?: string;
  readinessStatus?: "ready" | "setup_required" | "plan_upgrade_required";
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleDateTimeValue(): string {
  const base = new Date(Date.now() + 15 * 60 * 1000);
  base.setSeconds(0, 0);
  const remainder = base.getMinutes() % 5;
  if (remainder !== 0) {
    base.setMinutes(base.getMinutes() + (5 - remainder));
  }
  return toDateTimeLocalValue(base);
}

function isoToLocalDateTimeValue(iso?: string | null): string {
  if (!iso) return defaultScheduleDateTimeValue();
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return defaultScheduleDateTimeValue();
  return toDateTimeLocalValue(parsed);
}

function getCampaignStatusVariant(status: CampaignStatus): "secondary" | "outline" | "success" | "warning" {
  if (status === "completed") return "success";
  if (status === "running" || status === "scheduled") return "warning";
  if (status === "cancelled") return "secondary";
  return "outline";
}

function getCampaignStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case "draft":
      return "Borrador";
    case "scheduled":
      return "Programada";
    case "running":
      return "En curso";
    case "completed":
      return "Completada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function emptyStats(): CampaignStats {
  return { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, replied: 0 };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | ChatChannel>("all");
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  const [name, setName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<ChatChannel[]>(["whatsapp"]);
  const [tagFilter, setTagFilter] = useState("");
  const [createChannelFilter, setCreateChannelFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [runningScheduled, setRunningScheduled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(() => defaultScheduleDateTimeValue());

  const visibleCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      const matchesSearch = !search.trim() || campaign.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const matchesChannel = channelFilter === "all" || (campaign.channels || []).includes(channelFilter);
      return matchesSearch && matchesStatus && matchesChannel;
    });
  }, [campaigns, channelFilter, search, statusFilter]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) || null,
    [campaigns, selectedId]
  );
  const selectedBetaChannels = useMemo(
    () => selectedChannels.filter((channel) => isBetaChannel(channel)),
    [selectedChannels]
  );
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Local",
    []
  );

  async function loadCampaigns() {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const json = (await res.json()) as SetupRequiredApiResponse<Campaign[]>;

      if (json.setup_required) {
        setSetupState({
          module: "Campanas",
          message: json.message,
          migrationFile: json.migration_file,
          planRequired: json.plan_required,
          readinessStatus: json.readiness_status,
        });
        setCampaigns([]);
        setSelectedId(null);
        return;
      }

      if (!res.ok) throw new Error(json.error || "No se pudieron cargar las campanas");
      const nextCampaigns = json.data || [];
      setSetupState(null);
      setCampaigns(nextCampaigns);
      setSelectedId((current) => {
        if (current && nextCampaigns.some((campaign) => campaign.id === current)) return current;
        return nextCampaigns[0]?.id || null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error cargando campanas");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats(campaignId: string) {
    try {
      const res = await fetch(`/api/campaigns/stats?campaign_id=${campaignId}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: CampaignStats; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "No se pudo cargar el rendimiento");
      setStats(json.data);
    } catch (error) {
      setStats(null);
      toast.error(error instanceof Error ? error.message : "Error cargando rendimiento");
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (!selectedCampaign) {
      setStats(null);
      return;
    }
    void loadStats(selectedCampaign.id);
  }, [selectedCampaign?.id]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setScheduleAt(isoToLocalDateTimeValue(selectedCampaign.scheduled_at));
  }, [selectedCampaign?.id, selectedCampaign?.scheduled_at]);

  function resetCreateForm() {
    setName("");
    setMessageTemplate("");
    setSelectedChannels(["whatsapp"]);
    setTagFilter("");
    setCreateChannelFilter("");
    setStageFilter("");
    setMediaUrl("");
  }

  function toggleChannel(channel: ChatChannel) {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((item) => item !== channel) : [...prev, channel]
    );
  }

  async function handleCreate() {
    if (!name.trim()) return toast.error("Ingresa un nombre para la campana");
    if (!messageTemplate.trim()) return toast.error("Ingresa el mensaje principal");
    if (selectedChannels.length === 0) return toast.error("Selecciona al menos un canal");

    setCreating(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          message_template: messageTemplate.trim(),
          channels: selectedChannels,
          filters: {
            tag: tagFilter.trim() || undefined,
            channel: createChannelFilter.trim() || undefined,
            lead_stage: stageFilter.trim() || undefined,
            media_url: mediaUrl.trim() || undefined,
          },
        }),
      });
      const json = (await res.json()) as SetupRequiredApiResponse<Campaign>;

      if (json.setup_required) {
        setSetupState({
          module: "Campanas",
          message: json.error || json.message,
          migrationFile: json.migration_file,
          planRequired: json.plan_required,
          readinessStatus: json.readiness_status,
        });
        setOpenCreate(false);
        return;
      }

      if (!res.ok || !json.data) throw new Error(json.error || "No se pudo crear la campana");
      setCampaigns((prev) => [json.data!, ...prev]);
      setSelectedId(json.data.id);
      setOpenCreate(false);
      resetCreateForm();
      toast.success("Campana creada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error creando campana");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendNow() {
    if (!selectedCampaign) return;
    setSending(true);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: selectedCampaign.id, mode: "now", batch_size: 200 }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo iniciar el envio");
      toast.success("Envio iniciado");
      await loadCampaigns();
      await loadStats(selectedCampaign.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error enviando campana");
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    if (!selectedCampaign) return;
    const parsed = new Date(scheduleAt);
    if (!scheduleAt || Number.isNaN(parsed.getTime())) {
      return toast.error("Selecciona una fecha y hora valida");
    }

    setScheduling(true);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: selectedCampaign.id, mode: "scheduled", scheduled_at: parsed.toISOString() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo programar la campana");
      toast.success(`Campana programada para ${formatDate(parsed.toISOString())}`);
      await loadCampaigns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error programando campana");
    } finally {
      setScheduling(false);
    }
  }

  async function handleRunScheduledNow() {
    setRunningScheduled(true);
    try {
      const res = await fetch("/api/campaigns/run-scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25, batch_size: 200 }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { scanned: number; processed: number; sent: number; failed: number; skipped: number };
      };
      if (!res.ok || !json.data) throw new Error(json.error || "No se pudieron ejecutar campanas programadas");

      toast.success(
        `Programadas procesadas: ${json.data.scanned}. Enviados: ${json.data.sent}. Fallidos: ${json.data.failed}.`
      );
      await loadCampaigns();
      if (selectedCampaign) {
        await loadStats(selectedCampaign.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error ejecutando campanas programadas");
    } finally {
      setRunningScheduled(false);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Megaphone className="h-6 w-6 text-primary" />
            Campanas
          </h1>
          <p className="text-sm text-muted-foreground">
            Organiza promociones por audiencia, canal y etapa de lead sin perder lectura operativa.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} disabled={Boolean(setupState)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva campana
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4 pb-4">
            <div>
              <CardTitle className="text-base">Listado</CardTitle>
              <CardDescription>
                {campaigns.length} campanas en total. Usa filtros rapidos para encontrar la correcta.
              </CardDescription>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nombre"
                  className="pl-9"
                  aria-label="Buscar campana"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={statusFilter === item.value}
                    onClick={() => setStatusFilter(item.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      statusFilter === item.value ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted/40"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={channelFilter === "all"}
                  onClick={() => setChannelFilter("all")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    channelFilter === "all" ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted/40"
                  }`}
                >
                  Todos los canales
                </button>
                {CHANNELS.map((channel) => (
                  <ChannelSelectChip
                    key={channel}
                    channel={channel}
                    selected={channelFilter === channel}
                    onClick={() => setChannelFilter(channel)}
                  />
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando campanas...</p>
            ) : visibleCampaigns.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay campanas que coincidan con los filtros actuales.
              </div>
            ) : (
              visibleCampaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedId(campaign.id)}
                  aria-current={selectedId === campaign.id ? "true" : undefined}
                  className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selectedId === campaign.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{campaign.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {campaign.scheduled_at ? `Programada ${formatDate(campaign.scheduled_at)}` : `Creada ${formatDate(campaign.created_at)}`}
                      </p>
                    </div>
                    <Badge variant={getCampaignStatusVariant(campaign.status)}>
                      {getCampaignStatusLabel(campaign.status)}
                    </Badge>
                  </div>
                  <ChannelInlineList channels={campaign.channels || []} className="mt-3" />
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {setupState ? (
            <SetupRequiredState
              module={setupState.module}
              message={setupState.message}
              migrationFile={setupState.migrationFile}
              planRequired={setupState.planRequired}
              readinessStatus={setupState.readinessStatus}
              featureFlags={["campaigns_enabled"]}
              onRetry={() => void loadCampaigns()}
            />
          ) : !selectedCampaign ? (
            <Card>
              <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
                <CircleDashed className="h-8 w-8 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Selecciona una campana o crea una nueva</p>
                  <p className="text-sm text-muted-foreground">
                    Cuando haya muchas campanas, este panel te mostrara detalle, segmentacion y rendimiento sin mezclarlo con el formulario.
                  </p>
                </div>
                <Button onClick={() => setOpenCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear primera campana
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl">{selectedCampaign.name}</CardTitle>
                      <Badge variant={getCampaignStatusVariant(selectedCampaign.status)}>
                        {getCampaignStatusLabel(selectedCampaign.status)}
                      </Badge>
                    </div>
                    <CardDescription>
                      {selectedCampaign.scheduled_at
                        ? `Salida programada para ${formatDate(selectedCampaign.scheduled_at)}`
                        : `Creada el ${formatDate(selectedCampaign.created_at)}`}
                      {selectedCampaign.run_status ? ` · Estado operativo: ${selectedCampaign.run_status}` : ""}
                      {selectedCampaign.next_run_at ? ` · Proxima corrida: ${formatDate(selectedCampaign.next_run_at)}` : ""}
                    </CardDescription>
                    <ChannelInlineList channels={selectedCampaign.channels || []} />
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px] space-y-1">
                      <label htmlFor="campaign-schedule-at" className="text-xs font-medium text-muted-foreground">
                        Fecha y hora de envio
                      </label>
                      <Input
                        id="campaign-schedule-at"
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(event) => setScheduleAt(event.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">Zona horaria aplicada: {browserTimezone}</p>
                    </div>
                    <Button variant="outline" onClick={() => void loadStats(selectedCampaign.id)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refrescar
                    </Button>
                    <Button variant="outline" onClick={handleSchedule} disabled={scheduling}>
                      <CalendarClock className="mr-2 h-4 w-4" />
                      {scheduling ? "Programando..." : "Programar"}
                    </Button>
                    <Button variant="outline" onClick={handleRunScheduledNow} disabled={runningScheduled}>
                      <CalendarClock className="mr-2 h-4 w-4" />
                      {runningScheduled ? "Procesando..." : "Ejecutar programadas"}
                    </Button>
                    <Button onClick={handleSendNow} disabled={sending}>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      {sending ? "Enviando..." : "Enviar ahora"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="overview">Resumen</TabsTrigger>
                    <TabsTrigger value="content">Contenido</TabsTrigger>
                    <TabsTrigger value="audience">Segmentacion</TabsTrigger>
                    <TabsTrigger value="stats">Estadisticas</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Alcance previsto</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-2xl font-semibold">
                            <Target className="h-5 w-5 text-primary" />
                            {stats?.queued ?? 0}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Contactos preparados para el siguiente envio.</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Enviados</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-2xl font-semibold">
                            <Send className="h-5 w-5 text-primary" />
                            {stats?.sent ?? 0}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Mensajes salidos con exito desde este flujo.</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Respuestas</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-2xl font-semibold">
                            <Users className="h-5 w-5 text-primary" />
                            {stats?.replied ?? 0}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Conversaciones reactivadas por la campana.</p>
                        </CardContent>
                      </Card>
                    </div>

                    {stats?.summary ? (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Estado de ejecucion</CardTitle>
                          <CardDescription>
                            Ultimo envio: {stats.summary.last_sent_at ? formatDate(stats.summary.last_sent_at) : "Sin envios"}
                            {" · "}
                            Ultimo fallo: {stats.summary.last_failed_at ? formatDate(stats.summary.last_failed_at) : "Sin fallos"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                            <p className="font-medium">Siguiente accion recomendada: {stats.summary.next_action}</p>
                            <p className="text-muted-foreground">{stats.summary.next_action_detail}</p>
                          </div>
                          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                            <p>Procesados: <span className="font-semibold text-foreground">{stats.summary.processed}</span></p>
                            <p>Enviados: <span className="font-semibold text-foreground">{stats.summary.sent}</span></p>
                            <p>Fallidos: <span className="font-semibold text-foreground">{stats.summary.failed}</span></p>
                            <p>En cola: <span className="font-semibold text-foreground">{stats.summary.queued}</span></p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="content" className="space-y-4">
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="text-sm font-medium">Mensaje principal</p>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                        {selectedCampaign.message_template}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="text-sm font-medium">Preview corto</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {truncate(selectedCampaign.message_template, 180)}
                      </p>
                    </div>
                    {typeof (selectedCampaign.filters as Record<string, unknown>)?.media_url === "string" &&
                    String((selectedCampaign.filters as Record<string, unknown>).media_url).trim().length > 0 ? (
                      <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="mb-3 text-sm font-medium">Imagen de campana</p>
                        <img
                          src={String((selectedCampaign.filters as Record<string, unknown>).media_url)}
                          alt="Imagen de campana"
                          className="max-h-64 w-full rounded-md border object-cover"
                        />
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="audience" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Tag</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {String((selectedCampaign.filters || {}).tag || "Sin filtro")}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Canal objetivo</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {String((selectedCampaign.filters || {}).channel || "Todos los seleccionados")}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Etapa de lead</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {String((selectedCampaign.filters || {}).lead_stage || "Sin restriccion")}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="stats" className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      {Object.entries(stats || emptyStats())
                        .filter(([key]) => key !== "summary")
                        .filter(([key]) => key !== "by_channel" && key !== "recent_failures")
                        .map(([key, value]) => (
                        <div key={key} className="rounded-xl border bg-background p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                          <p className="mt-2 text-2xl font-semibold">{value}</p>
                        </div>
                        ))}
                    </div>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Seguimiento por canal</CardTitle>
                        <CardDescription>Permite ver en que canal se envio y donde fallo.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {!stats?.by_channel || stats.by_channel.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Sin registros por canal aun.</p>
                        ) : (
                          stats.by_channel.map((channelStats) => (
                            <div key={channelStats.channel} className="rounded-md border p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="inline-flex items-center gap-2 text-sm font-medium">
                                  {channelStats.channel}
                                  {isBetaChannel(channelStats.channel) ? (
                                    <Badge variant="outline" className="text-[10px]">Beta</Badge>
                                  ) : null}
                                </span>
                                <div className="flex gap-2 text-xs">
                                  <Badge variant="secondary">Enviados: {channelStats.sent}</Badge>
                                  <Badge variant={channelStats.failed > 0 ? "destructive" : "secondary"}>
                                    Fallidos: {channelStats.failed}
                                  </Badge>
                                </div>
                              </div>
                              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3 md:grid-cols-6">
                                <span>queued: {channelStats.queued}</span>
                                <span>sent: {channelStats.sent}</span>
                                <span>delivered: {channelStats.delivered}</span>
                                <span>read: {channelStats.read}</span>
                                <span>failed: {channelStats.failed}</span>
                                <span>skipped: {channelStats.skipped}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Ultimos fallos de envio</CardTitle>
                        <CardDescription>Detalle util para corregir destinatarios o politicas de canal.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {!stats?.recent_failures || stats.recent_failures.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Sin fallos recientes.</p>
                        ) : (
                          stats.recent_failures.map((failure, index) => (
                            <div key={`${failure.updated_at}-${index}`} className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">
                                {failure.channel} · {formatDate(failure.updated_at)}
                              </p>
                              <p className="mt-1 text-sm">
                                {(failure.contact_name || failure.contact_identifier || "contacto sin identificar")}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{failure.error || "Sin detalle"}</p>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Sheet open={openCreate} onOpenChange={setOpenCreate}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Nueva campana</SheetTitle>
            <SheetDescription>
              Define audiencia, canales y mensaje principal en un flujo separado del listado.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <label htmlFor="campaign-name" className="text-sm font-medium">Nombre de campana</label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej: Reactivacion clientes VIP"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Canales</label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((channel) => (
                  <ChannelSelectChip
                    key={channel}
                    channel={channel}
                    selected={selectedChannels.includes(channel)}
                    onClick={() => toggleChannel(channel)}
                    disabled={creating}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Recomendado: WhatsApp primero. Instagram y Messenger operan en beta y pueden rechazar mensajes por ventanas/politicas de Meta.
              </p>
              {selectedBetaChannels.length > 0 ? (
                <p className="text-xs text-amber-600">
                  Canales beta seleccionados: {selectedBetaChannels.join(", ")}. Verifica identificadores y ventana de mensajeria.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="campaign-message" className="text-sm font-medium">Mensaje principal</label>
              <Textarea
                id="campaign-message"
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                placeholder="Hola {{name}}, esta semana activamos una promocion especial para ti..."
                className="min-h-32"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="campaign-media-url" className="text-sm font-medium">Imagen (URL publica, opcional)</label>
              <Input
                id="campaign-media-url"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://.../imagen.jpg"
              />
              <p className="text-xs text-muted-foreground">
                Si agregas imagen, se enviara junto al texto en canales compatibles.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="campaign-tag" className="text-sm font-medium">Tag de audiencia (opcional)</label>
                <Input
                  id="campaign-tag"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  placeholder="cliente_vip"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-channel-filter" className="text-sm font-medium">Canal puntual (opcional)</label>
                <Input
                  id="campaign-channel-filter"
                  value={createChannelFilter}
                  onChange={(event) => setCreateChannelFilter(event.target.value)}
                  placeholder="instagram"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-stage" className="text-sm font-medium">Etapa de lead (opcional)</label>
                <Input
                  id="campaign-stage"
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  placeholder="interested"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Tag, canal puntual y etapa son opcionales. Si los dejas vacios, la campana toma todos los contactos del canal seleccionado.
            </p>

            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Esta campana permite texto y, opcionalmente, una imagen por URL publica.
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenCreate(false);
                  resetCreateForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleCreate} disabled={creating || Boolean(setupState)}>
                <Send className="mr-2 h-4 w-4" />
                {creating ? "Creando..." : "Crear campana"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

