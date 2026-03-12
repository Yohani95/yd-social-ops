"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDashed, Plus, Route, Save, Search, ShieldCheck, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SetupRequiredState } from "@/components/dashboard/setup-required-state";
import { ChannelSelectChip } from "@/components/dashboard/channel-meta";
import { MemberSelect } from "@/components/dashboard/member-select";
import { formatDate } from "@/lib/utils";
import type { ChatChannel, LeadStage, RoutingRule, SetupRequiredApiResponse } from "@/types";

interface SetupState {
  module: string;
  message?: string;
  migrationFile?: string;
  planRequired?: string;
  readinessStatus?: "ready" | "setup_required" | "plan_upgrade_required";
}

interface RuleDraft {
  id?: string;
  name: string;
  priority: number;
  target_team: string;
  target_tenant_user_id: string;
  intents: string[];
  channels: ChatChannel[];
  tags: string;
  lead_stages: LeadStage[];
  is_active: boolean;
}

const INTENT_OPTIONS = [
  { value: "purchase_intent", label: "Compra" },
  { value: "inquiry", label: "Consulta" },
  { value: "complaint", label: "Reclamo" },
  { value: "greeting", label: "Saludo" },
];

const LEAD_STAGE_OPTIONS: LeadStage[] = ["new", "contacted", "qualified", "interested", "checkout", "customer", "lost"];
const CHANNEL_OPTIONS: ChatChannel[] = ["web", "whatsapp", "messenger", "instagram", "tiktok"];
const TEAM_PRESETS = ["ventas", "soporte", "general"];

const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  interested: "Interesado",
  checkout: "Checkout",
  customer: "Cliente",
  lost: "Perdido",
};

function toDraft(rule?: RoutingRule): RuleDraft {
  const condition = (rule?.condition || {}) as Record<string, unknown>;
  return {
    id: rule?.id,
    name: rule?.name || "",
    priority: rule?.priority ?? 100,
    target_team: rule?.target_team || "general",
    target_tenant_user_id: rule?.target_tenant_user_id || "",
    intents: Array.isArray(condition.intents) ? (condition.intents as string[]) : [],
    channels: Array.isArray(condition.channels) ? (condition.channels as ChatChannel[]) : [],
    tags: Array.isArray(condition.contact_tags) ? (condition.contact_tags as string[]).join(", ") : "",
    lead_stages: Array.isArray(condition.lead_stages) ? (condition.lead_stages as LeadStage[]) : [],
    is_active: rule?.is_active ?? true,
  };
}

function toggleString(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleStage(values: LeadStage[], value: LeadStage) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function buildRuleSummary(rule: RoutingRule | RuleDraft) {
  const condition = ("condition" in rule ? rule.condition : {
    intents: rule.intents,
    channels: rule.channels,
    contact_tags: rule.tags.split(",").map((item) => item.trim()).filter(Boolean),
    lead_stages: rule.lead_stages,
  }) as Record<string, unknown>;

  const parts: string[] = [];
  if (Array.isArray(condition.intents) && condition.intents.length > 0) parts.push(`intencion: ${(condition.intents as string[]).join(", ")}`);
  if (Array.isArray(condition.channels) && condition.channels.length > 0) parts.push(`canal: ${(condition.channels as string[]).join(", ")}`);
  if (Array.isArray(condition.lead_stages) && condition.lead_stages.length > 0) parts.push(`etapa: ${(condition.lead_stages as string[]).join(", ")}`);
  if (Array.isArray(condition.contact_tags) && condition.contact_tags.length > 0) parts.push(`tags: ${(condition.contact_tags as string[]).join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "Sin condiciones adicionales";
}

function getRuleHealth(rule: RoutingRule): { label: string; variant: "success" | "secondary" | "outline" } {
  if (rule.health_status === "requires_setup") {
    return { label: "Requiere setup", variant: "outline" };
  }
  if (rule.health_status === "active" || rule.is_active) {
    return { label: "Activa", variant: "success" };
  }
  return { label: "Inactiva", variant: "secondary" };
}

export default function RoutingPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(toDraft());
  const [search, setSearch] = useState("");
  const [setupState, setSetupState] = useState<SetupState | null>(null);

  const visibleRules = useMemo(() => {
    return rules.filter((rule) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return rule.name.toLowerCase().includes(term) || rule.target_team.toLowerCase().includes(term);
    });
  }, [rules, search]);

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) || null;

  async function loadRules() {
    setLoading(true);
    try {
      const res = await fetch("/api/routing/rules", { cache: "no-store" });
      const json = (await res.json()) as SetupRequiredApiResponse<RoutingRule[]>;

      if (json.setup_required) {
        setSetupState({
          module: "Routing",
          message: json.message,
          migrationFile: json.migration_file,
          planRequired: json.plan_required,
          readinessStatus: json.readiness_status,
        });
        setRules([]);
        setSelectedRuleId(null);
        return;
      }

      if (!res.ok) throw new Error(json.error || "No se pudieron cargar las reglas");
      const data = json.data || [];
      setSetupState(null);
      setRules(data);
      if (data.length > 0 && !selectedRuleId) {
        setSelectedRuleId(data[0].id);
        setDraft(toDraft(data[0]));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error cargando reglas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  useEffect(() => {
    if (!selectedRule) return;
    setDraft(toDraft(selectedRule));
  }, [selectedRule?.id]);

  function updateDraft(next: Partial<RuleDraft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  async function saveRule() {
    if (!draft.name.trim()) return toast.error("Escribe un nombre para la regla");
    if (!draft.target_team.trim()) return toast.error("Define el equipo destino");

    setSaving(true);
    try {
      const res = await fetch("/api/routing/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          name: draft.name.trim(),
          priority: Number.isFinite(draft.priority) ? Number(draft.priority) : 100,
          is_active: draft.is_active,
          target_team: draft.target_team.trim(),
          target_tenant_user_id: draft.target_tenant_user_id.trim() || null,
          condition: {
            intents: draft.intents,
            channels: draft.channels,
            contact_tags: draft.tags.split(",").map((item) => item.trim()).filter(Boolean),
            lead_stages: draft.lead_stages,
          },
        }),
      });
      const json = (await res.json()) as SetupRequiredApiResponse<RoutingRule>;

      if (json.setup_required) {
        setSetupState({
          module: "Routing",
          message: json.error || json.message,
          migrationFile: json.migration_file,
          planRequired: json.plan_required,
          readinessStatus: json.readiness_status,
        });
        return;
      }

      if (!res.ok || !json.data) throw new Error(json.error || "No se pudo guardar la regla");
      toast.success("Regla guardada");
      await loadRules();
      setSelectedRuleId(json.data.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error guardando regla");
    } finally {
      setSaving(false);
    }
  }

  function newRule() {
    setSelectedRuleId(null);
    setDraft(toDraft());
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Route className="h-6 w-6 text-primary" />
            Routing automatico
          </h1>
          <p className="text-sm text-muted-foreground">
            Define reglas de asignacion con lenguaje operativo: cuando aplica, a quien envia y como se ve el resultado.
          </p>
        </div>
        <Button variant="outline" onClick={newRule} disabled={Boolean(setupState)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva regla
        </Button>
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Routing <strong className="text-foreground">no responde al cliente</strong>. Solo decide equipo/agente responsable.
          Para respuestas automaticas debes usar <strong className="text-foreground">Workflows</strong>.
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4 pb-4">
            <div>
              <CardTitle className="text-base">Reglas</CardTitle>
              <CardDescription>Ordenadas por prioridad, con resumen corto para encontrar la correcta rapido.</CardDescription>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o equipo"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando reglas...</p>
            ) : visibleRules.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay reglas todavia. Crea una regla de ventas o soporte para empezar.
              </div>
            ) : (
              visibleRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setSelectedRuleId(rule.id)}
                  aria-current={selectedRuleId === rule.id ? "true" : undefined}
                  className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selectedRuleId === rule.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  {(() => {
                    const health = getRuleHealth(rule);
                    return (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{rule.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{buildRuleSummary(rule)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Actualizada {formatDate(rule.updated_at)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ultima aplicacion: {rule.last_applied_at ? formatDate(rule.last_applied_at) : "Sin ejecucion registrada"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline">P{rule.priority}</Badge>
                      <Badge variant={health.variant}>{health.label}</Badge>
                      <Badge variant="secondary">24h: {rule.applied_count_24h || 0}</Badge>
                    </div>
                  </div>
                    );
                  })()}
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
              featureFlags={["routing_enabled"]}
              onRetry={() => void loadRules()}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{draft.id ? draft.name || "Editar regla" : "Nueva regla"}</CardTitle>
                <CardDescription>
                  Define cuando aplica la regla, a quien asigna la conversacion y valida el resultado esperado antes de guardar.
                </CardDescription>
                {selectedRule ? (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Ultima aplicacion: {selectedRule.last_applied_at ? formatDate(selectedRule.last_applied_at) : "Sin ejecucion registrada"} ·
                    Aplicaciones 24h: {selectedRule.applied_count_24h || 0}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label htmlFor="rule-name" className="text-sm font-medium">Nombre</label>
                    <Input id="rule-name" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="rule-priority" className="text-sm font-medium">Prioridad</label>
                    <Input id="rule-priority" value={String(draft.priority)} onChange={(event) => updateDraft({ priority: Number(event.target.value || 100) })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estado</label>
                    <div className="flex gap-2">
                      <Button variant={draft.is_active ? "default" : "outline"} type="button" onClick={() => updateDraft({ is_active: true })}>Activa</Button>
                      <Button variant={!draft.is_active ? "secondary" : "outline"} type="button" onClick={() => updateDraft({ is_active: false })}>Inactiva</Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Cuando aplica
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Intenciones frecuentes</label>
                    <div className="flex flex-wrap gap-2">
                      {INTENT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={draft.intents.includes(option.value)}
                          onClick={() => updateDraft({ intents: toggleString(draft.intents, option.value) })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            draft.intents.includes(option.value) ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted/40"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canales</label>
                    <div className="flex flex-wrap gap-2">
                      {CHANNEL_OPTIONS.map((channel) => (
                        <ChannelSelectChip
                          key={channel}
                          channel={channel}
                          selected={draft.channels.includes(channel)}
                          onClick={() => updateDraft({ channels: toggleString(draft.channels, channel) as ChatChannel[] })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Etapas de lead</label>
                    <div className="flex flex-wrap gap-2">
                      {LEAD_STAGE_OPTIONS.map((stage) => (
                        <button
                          key={stage}
                          type="button"
                          aria-pressed={draft.lead_stages.includes(stage)}
                          onClick={() => updateDraft({ lead_stages: toggleStage(draft.lead_stages, stage) })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            draft.lead_stages.includes(stage) ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted/40"
                          }`}
                        >
                          {LEAD_STAGE_LABELS[stage]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="rule-tags" className="text-sm font-medium">Tags de contacto</label>
                    <Input id="rule-tags" value={draft.tags} onChange={(event) => updateDraft({ tags: event.target.value })} placeholder="cliente_vip, urgente" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <UserRound className="h-4 w-4 text-primary" />
                    A quien asigna
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipo destino</label>
                    <div className="flex flex-wrap gap-2">
                      {TEAM_PRESETS.map((team) => (
                        <button
                          key={team}
                          type="button"
                          aria-pressed={draft.target_team === team}
                          onClick={() => updateDraft({ target_team: team })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            draft.target_team === team ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted/40"
                          }`}
                        >
                          {team}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="rule-team" className="text-sm font-medium">Equipo personalizado</label>
                      <Input id="rule-team" value={draft.target_team} onChange={(event) => updateDraft({ target_team: event.target.value })} placeholder="ventas o soporte" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="rule-agent" className="text-sm font-medium">Agente especifico (opcional)</label>
                      <MemberSelect
                        id="rule-agent"
                        value={draft.target_tenant_user_id}
                        onChange={(nextValue) => updateDraft({ target_tenant_user_id: nextValue })}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Simulacion rapida</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Si entra una conversacion que cumpla <strong className="text-foreground">{buildRuleSummary(draft)}</strong>, se asignara a <strong className="text-foreground">{draft.target_team || "general"}</strong>{draft.target_tenant_user_id ? " y a un agente especifico" : ""}.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveRule} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Guardando..." : "Guardar regla"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!setupState && !draft.id && rules.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                <CircleDashed className="h-4 w-4" />
                Empieza con una regla para ventas o soporte. La vista ya esta preparada para crecer sin volverse un formulario crudo.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

