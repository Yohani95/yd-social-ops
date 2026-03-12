"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  FlaskConical,
  GitBranch,
  GripVertical,
  LayoutPanelLeft,
  MessageSquare,
  Plus,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MemberSelect } from "@/components/dashboard/member-select";
import { toast } from "sonner";
import { SetupRequiredState } from "@/components/dashboard/setup-required-state";
import { DashboardModuleHeader } from "@/components/dashboard/module-header";
import { formatDate } from "@/lib/utils";
import type {
  AutomationNode,
  AutomationWorkflow,
  SetupRequiredApiResponse,
  WorkflowActionType,
  WorkflowConditionType,
  WorkflowTriggerType,
} from "@/types";

type WizardStep = 1 | 2 | 3 | 4 | 5;

type ConditionDraft = {
  id?: string;
  type: WorkflowConditionType;
  value: string;
};

type ActionDraft = {
  id?: string;
  type: WorkflowActionType;
  value: string;
  extra?: string;
};

type VisualNode = {
  id: string;
  lane: "trigger" | "condition" | "action";
  title: string;
  detail: string;
  sourceIndex: number | null;
};

interface SetupState {
  module: string;
  message?: string;
  migrationFile?: string;
  planRequired?: string;
  readinessStatus?: "ready" | "setup_required" | "plan_upgrade_required";
}

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Base",
  2: "Trigger",
  3: "Condiciones",
  4: "Acciones",
  5: "Revision",
};

const WIZARD_STEPS: WizardStep[] = [1, 2, 3, 4, 5];

const WORKFLOW_STATUS_FILTERS: Array<{ value: "all" | "active" | "draft" | "archived"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "draft", label: "Borrador" },
  { value: "archived", label: "Archivados" },
];

const TRIGGERS: Array<{
  value: WorkflowTriggerType;
  label: string;
  help: string;
  icon: typeof MessageSquare;
}> = [
  { value: "message_received", label: "Mensaje entrante", help: "Cuando llega un DM o mensaje privado.", icon: MessageSquare },
  { value: "comment_received", label: "Comentario publico", help: "Cuando un usuario comenta en una publicacion.", icon: Sparkles },
  { value: "lead_stage_changed", label: "Cambio de etapa", help: "Cuando el lead avanza o retrocede en el pipeline.", icon: CheckCircle2 },
  { value: "payment_received", label: "Pago confirmado", help: "Cuando Mercado Pago reporta un pago aprobado.", icon: CreditCard },
  { value: "scheduled_event", label: "Evento programado", help: "Cuando una tarea agendada debe dispararse.", icon: CalendarClock },
];

const CONDITION_OPTIONS: Array<{ value: WorkflowConditionType; label: string; placeholder: string; help: string }> = [
  { value: "message_contains", label: "Mensaje contiene", placeholder: "precio, promo, descuento", help: "Usa palabras separadas por coma." },
  { value: "intent_detected", label: "Intencion detectada", placeholder: "purchase_intent", help: "Reutiliza las intenciones ya detectadas por el bot." },
  { value: "channel", label: "Canal", placeholder: "whatsapp o instagram", help: "Restringe el flujo a un canal especifico." },
  { value: "contact_tag", label: "Tag de contacto", placeholder: "cliente_vip", help: "Solo aplica a contactos etiquetados." },
  { value: "product_interest", label: "Interes de producto", placeholder: "producto o keyword", help: "Filtra cuando el cliente pregunta por un item concreto." },
  { value: "payment_status", label: "Estado de pago", placeholder: "paid o pending", help: "Util para automatizaciones posteriores al cobro." },
];

const ACTION_OPTIONS: Array<{ value: WorkflowActionType; label: string; placeholder: string; help: string; extraLabel?: string }> = [
  { value: "send_message", label: "Enviar mensaje", placeholder: "Hola {{name}}, te ayudo con tu compra.", help: "Respuesta automatica visible para el cliente." },
  { value: "generate_payment_link", label: "Generar link de pago", placeholder: "Reserva o pedido", help: "Genera el link y deja el mensaje listo.", extraLabel: "Monto CLP" },
  { value: "assign_agent", label: "Asignar agente", placeholder: "Selecciona un agente", help: "Puedes elegir un agente especifico o dejarlo vacio para usar routing." },
  { value: "change_lead_stage", label: "Cambiar etapa", placeholder: "qualified o checkout", help: "Actualiza el pipeline del contacto.", extraLabel: "Lead value" },
  { value: "add_tag", label: "Agregar tag", placeholder: "interesado o urgente", help: "Marca el contacto para segmentaciones futuras." },
  { value: "call_webhook", label: "Llamar webhook", placeholder: "https://...", help: "Dispara una integracion externa." },
  { value: "delay", label: "Esperar", placeholder: "3000", help: "Pausa en milisegundos antes de seguir." },
];

const TEMPLATES = [
  {
    title: "Responder intencion de compra",
    description: "Detecta interes comercial y responde con un primer mensaje.",
    apply: () => ({
      name: "Venta inicial",
      description: "Responde de forma automatica cuando el cliente muestra interes de compra.",
      triggerType: "message_received" as WorkflowTriggerType,
      conditions: [{ type: "intent_detected" as WorkflowConditionType, value: "purchase_intent" }],
      actions: [{ type: "send_message" as WorkflowActionType, value: "Hola {{name}}, te ayudo con tu compra. Cuentame que necesitas." }],
    }),
  },
  {
    title: "Mover lead a checkout",
    description: "Actualiza la etapa cuando el cliente pide pagar o reservar.",
    apply: () => ({
      name: "Mover a checkout",
      description: "Cambia la etapa del lead cuando el usuario entra en fase de compra.",
      triggerType: "message_received" as WorkflowTriggerType,
      conditions: [{ type: "message_contains" as WorkflowConditionType, value: "quiero pagar, reservar, comprar ahora" }],
      actions: [{ type: "change_lead_stage" as WorkflowActionType, value: "checkout", extra: "0" }],
    }),
  },
  {
    title: "Enviar link de pago",
    description: "Genera el cobro y responde con el link en el mismo flujo.",
    apply: () => ({
      name: "Cobro automatico",
      description: "Genera un link de pago cuando el cliente pide finalizar la compra.",
      triggerType: "message_received" as WorkflowTriggerType,
      conditions: [{ type: "intent_detected" as WorkflowConditionType, value: "purchase_intent" }],
      actions: [{ type: "generate_payment_link" as WorkflowActionType, value: "Pedido", extra: "19990" }],
    }),
  },
];

function emptyCondition(): ConditionDraft {
  return { type: "message_contains", value: "" };
}

function emptyAction(): ActionDraft {
  return { type: "send_message", value: "" };
}

function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function triggerLabel(triggerType: WorkflowTriggerType): string {
  return TRIGGERS.find((trigger) => trigger.value === triggerType)?.label || triggerType;
}

function parseCondition(node: AutomationNode): ConditionDraft | null {
  if (node.node_type !== "condition") return null;
  const config = (node.config || {}) as Record<string, unknown>;
  const type = String(config.type || "") as WorkflowConditionType;
  if (!type) return null;
  if (Array.isArray(config.keywords)) return { id: node.id, type, value: config.keywords.join(", ") };
  return { id: node.id, type, value: String(config.value || "") };
}

function parseAction(node: AutomationNode): ActionDraft | null {
  if (node.node_type !== "action") return null;
  const config = (node.config || {}) as Record<string, unknown>;
  const type = String(config.type || "") as WorkflowActionType;
  if (!type) return null;
  if (type === "send_message") return { id: node.id, type, value: String(config.message || "") };
  if (type === "generate_payment_link") return { id: node.id, type, value: String(config.title || ""), extra: String(config.amount_clp || "") };
  if (type === "assign_agent") return { id: node.id, type, value: String(config.target_agent_id || "") };
  if (type === "change_lead_stage") return { id: node.id, type, value: String(config.stage || ""), extra: String(config.lead_value || "") };
  if (type === "add_tag") return { id: node.id, type, value: String(config.tag || "") };
  if (type === "call_webhook") return { id: node.id, type, value: String(config.url || "") };
  if (type === "delay") return { id: node.id, type, value: String(config.ms || "") };
  return null;
}

function conditionToNode(condition: ConditionDraft, workflowId: string, sequenceOrder: number) {
  const config: Record<string, unknown> = { type: condition.type };
  if (condition.type === "message_contains") {
    config.keywords = condition.value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  } else {
    config.value = condition.value;
  }

  return {
    id: condition.id,
    workflow_id: workflowId,
    node_type: "condition",
    sequence_order: sequenceOrder,
    label: CONDITION_OPTIONS.find((item) => item.value === condition.type)?.label || "Condicion",
    config,
  };
}

function actionToNode(action: ActionDraft, workflowId: string, sequenceOrder: number) {
  const config: Record<string, unknown> = { type: action.type };

  if (action.type === "send_message") config.message = action.value;
  if (action.type === "generate_payment_link") {
    config.title = action.value || "Pago";
    config.amount_clp = Number(action.extra || 0);
    config.message = "Te comparto tu link de pago: {{payment_link}}";
  }
  if (action.type === "assign_agent") config.target_agent_id = action.value;
  if (action.type === "change_lead_stage") {
    config.stage = action.value;
    config.lead_value = Number(action.extra || 0);
  }
  if (action.type === "add_tag") config.tag = action.value;
  if (action.type === "call_webhook") config.url = action.value;
  if (action.type === "delay") config.ms = Number(action.value || 0);

  return {
    id: action.id,
    workflow_id: workflowId,
    node_type: "action",
    sequence_order: sequenceOrder,
    label: ACTION_OPTIONS.find((item) => item.value === action.type)?.label || "Accion",
    config,
  };
}

function buildSummary(triggerType: WorkflowTriggerType, conditions: ConditionDraft[], actions: ActionDraft[]) {
  const readableConditions = conditions
    .filter((condition) => condition.value.trim())
    .map((condition) => `${CONDITION_OPTIONS.find((item) => item.value === condition.type)?.label || condition.type}: ${condition.value}`);

  const readableActions = actions
    .filter((action) => action.value.trim() || action.type === "delay")
    .map((action) => `${ACTION_OPTIONS.find((item) => item.value === action.type)?.label || action.type}: ${action.value || action.extra || "configurado"}`);

  return {
    trigger: triggerLabel(triggerType),
    conditions: readableConditions.length > 0 ? readableConditions : ["Sin condiciones extra"],
    actions: readableActions.length > 0 ? readableActions : ["Sin acciones configuradas"],
  };
}

function buildVisualNodes(triggerType: WorkflowTriggerType, conditions: ConditionDraft[], actions: ActionDraft[]): VisualNode[] {
  const triggerMeta = TRIGGERS.find((trigger) => trigger.value === triggerType);
  const base: VisualNode[] = [
    {
      id: "trigger",
      lane: "trigger",
      title: triggerMeta?.label || triggerType,
      detail: triggerMeta?.help || "Define el evento que inicia el flujo.",
      sourceIndex: null,
    },
  ];

  const conditionNodes = conditions
    .map((condition, index) => ({ condition, index }))
    .filter(({ condition }) => condition.value.trim())
    .map(({ condition, index }) => {
      const meta = CONDITION_OPTIONS.find((item) => item.value === condition.type);
      return {
        id: `condition-${index}`,
        lane: "condition" as const,
        title: meta?.label || condition.type,
        detail: condition.value,
        sourceIndex: index,
      };
    });

  const actionNodes = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.value.trim() || action.type === "delay")
    .map(({ action, index }) => {
      const meta = ACTION_OPTIONS.find((item) => item.value === action.type);
      const detail = action.value || action.extra || "Configurado";
      return {
        id: `action-${index}`,
        lane: "action" as const,
        title: meta?.label || action.type,
        detail,
        sourceIndex: index,
      };
    });

  return [...base, ...conditionNodes, ...actionNodes];
}

function getWorkflowHealth(workflow: AutomationWorkflow): { label: string; variant: "success" | "secondary" | "outline" } {
  if (workflow.health_status === "incomplete") {
    return { label: "Incompleto", variant: "outline" };
  }
  if (workflow.health_status === "active" || workflow.is_active) {
    return { label: "Activo", variant: "success" };
  }
  return { label: "Inactivo", variant: "secondary" };
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "archived">("all");
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("message_received");
  const [conditions, setConditions] = useState<ConditionDraft[]>([emptyCondition()]);
  const [actions, setActions] = useState<ActionDraft[]>([emptyAction()]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState("trigger");
  const [draggingConditionIndex, setDraggingConditionIndex] = useState<number | null>(null);
  const [draggingActionIndex, setDraggingActionIndex] = useState<number | null>(null);

  const visibleWorkflows = useMemo(() => {
    return workflows.filter((workflow) => {
      const matchesSearch = !search.trim() || workflow.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? workflow.is_active : workflow.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, workflows]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedId) || null,
    [selectedId, workflows]
  );

  const summary = useMemo(() => buildSummary(triggerType, conditions, actions), [actions, conditions, triggerType]);
  const visualNodes = useMemo(() => buildVisualNodes(triggerType, conditions, actions), [actions, conditions, triggerType]);
  const configuredConditions = useMemo(
    () => conditions.filter((condition) => condition.value.trim()),
    [conditions]
  );
  const configuredActions = useMemo(
    () => actions.filter((action) => action.value.trim() || action.type === "delay"),
    [actions]
  );
  const wizardProgress = Math.round((step / WIZARD_STEPS.length) * 100);
  const selectedCanvasNode =
    visualNodes.find((node) => node.id === selectedCanvasNodeId) || visualNodes[0] || null;
  const visualConditions = visualNodes.filter((node) => node.lane === "condition");
  const visualActions = visualNodes.filter((node) => node.lane === "action");
  const selectedConditionDraft =
    selectedCanvasNode?.lane === "condition" && selectedCanvasNode.sourceIndex !== null
      ? conditions[selectedCanvasNode.sourceIndex] || null
      : null;
  const selectedActionDraft =
    selectedCanvasNode?.lane === "action" && selectedCanvasNode.sourceIndex !== null
      ? actions[selectedCanvasNode.sourceIndex] || null
      : null;

  function resetDraft() {
    setSelectedId(null);
    setStep(1);
    setName("");
    setDescription("");
    setTriggerType("message_received");
    setConditions([emptyCondition()]);
    setActions([emptyAction()]);
    setSelectedCanvasNodeId("trigger");
  }

  async function loadWorkflows() {
    setLoading(true);
    try {
      const res = await fetch("/api/workflows", { cache: "no-store" });
      const json = (await res.json()) as SetupRequiredApiResponse<AutomationWorkflow[]>;

      if (json.setup_required) {
        setSetupState({
          module: "Workflows",
          message: json.message,
          migrationFile: json.migration_file,
          planRequired: json.plan_required,
          readinessStatus: json.readiness_status,
        });
        setWorkflows([]);
        setSelectedId(null);
        return;
      }

      if (!res.ok) throw new Error(json.error || "No se pudieron cargar los workflows");

      const list = json.data || [];
      setSetupState(null);
      setWorkflows(list);
      setSelectedId((current) => {
        if (current && list.some((workflow) => workflow.id === current)) return current;
        return list[0]?.id || null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error cargando workflows");
    } finally {
      setLoading(false);
    }
  }

  async function loadNodes(workflowId: string) {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/nodes`, { cache: "no-store" });
      const json = (await res.json()) as { data?: AutomationNode[]; error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudieron cargar los nodos");

      const nodes = json.data || [];
      const triggerNode = nodes.find((node) => node.node_type === "trigger");
      const parsedConditions = nodes.map(parseCondition).filter((item): item is ConditionDraft => Boolean(item));
      const parsedActions = nodes.map(parseAction).filter((item): item is ActionDraft => Boolean(item));

      if (triggerNode) {
        const triggerConfig = triggerNode.config as Record<string, unknown>;
        if (typeof triggerConfig.type === "string") {
          setTriggerType(triggerConfig.type as WorkflowTriggerType);
        }
      }

      setConditions(parsedConditions.length > 0 ? parsedConditions : [emptyCondition()]);
      setActions(parsedActions.length > 0 ? parsedActions : [emptyAction()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error cargando configuracion");
    }
  }

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    if (!selectedWorkflow) return;
    setName(selectedWorkflow.name);
    setDescription(selectedWorkflow.description || "");
    setTriggerType(selectedWorkflow.trigger_type);
    setSelectedCanvasNodeId("trigger");
    void loadNodes(selectedWorkflow.id);
  }, [selectedWorkflow]);

  function applyTemplate(index: number) {
    const template = TEMPLATES[index]?.apply();
    if (!template) return;
    setName(template.name);
    setDescription(template.description);
    setTriggerType(template.triggerType);
    setConditions(template.conditions);
    setActions(template.actions);
    setStep(2);
    setSelectedCanvasNodeId("trigger");
  }

  async function handleCreateWorkflow() {
    const cleanName = name.trim();
    if (!cleanName) return toast.error("Escribe un nombre para el workflow");

    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          description,
          trigger_type: triggerType,
          is_active: false,
        }),
      });
      const json = (await res.json()) as SetupRequiredApiResponse<AutomationWorkflow>;

      if (json.setup_required) {
        setSetupState({ module: "Workflows", message: json.error || json.message, migrationFile: json.migration_file });
        return;
      }

      if (!res.ok || !json.data) throw new Error(json.error || "No se pudo crear el workflow");
      setWorkflows((prev) => [json.data!, ...prev]);
      setSelectedId(json.data.id);
      toast.success("Workflow creado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error creando workflow");
    }
  }

  async function handleSaveNodes() {
    if (!selectedWorkflow) return;
    setSaving(true);
    try {
      const updateRes = await fetch(`/api/workflows/${selectedWorkflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || selectedWorkflow.name,
          description,
          trigger_type: triggerType,
        }),
      });
      const updateJson = (await updateRes.json()) as { error?: string };
      if (!updateRes.ok) throw new Error(updateJson.error || "No se pudo actualizar el workflow");

      const triggerNode = {
        workflow_id: selectedWorkflow.id,
        node_type: "trigger",
        sequence_order: 0,
        label: "Trigger",
        config: { type: triggerType },
      };

      const conditionNodes = conditions
        .filter((condition) => condition.value.trim())
        .map((condition, index) => conditionToNode(condition, selectedWorkflow.id, index + 10));

      const actionNodes = actions
        .filter((action) => action.value.trim() || action.type === "delay")
        .map((action, index) => actionToNode(action, selectedWorkflow.id, index + 100));

      const res = await fetch(`/api/workflows/${selectedWorkflow.id}/nodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: [triggerNode, ...conditionNodes, ...actionNodes] }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudieron guardar los nodos");

      toast.success("Workflow guardado");
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error guardando workflow");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!selectedWorkflow) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo activar el workflow");
      toast.success("Workflow activado");
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error activando workflow");
    } finally {
      setPublishing(false);
    }
  }

  async function handleTest() {
    if (!selectedWorkflow) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            triggerType,
            channel: "instagram",
            message: "Hola, quiero precio",
            intentDetected: "purchase_intent",
            contactTags: ["cliente"],
          },
        }),
      });
      const json = (await res.json()) as { data?: { outboundMessages?: string[] }; error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo ejecutar la prueba");
      toast.success(`Prueba ejecutada. Mensajes generados: ${json.data?.outboundMessages?.length || 0}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error en la prueba");
    } finally {
      setTesting(false);
    }
  }

  function updateCondition(index: number, next: Partial<ConditionDraft>) {
    setConditions((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));
  }

  function updateAction(index: number, next: Partial<ActionDraft>) {
    setActions((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));
  }

  function handleConditionDrop(targetIndex: number) {
    if (draggingConditionIndex === null) return;
    setConditions((prev) => moveInArray(prev, draggingConditionIndex, targetIndex));
    setSelectedCanvasNodeId(`condition-${targetIndex}`);
    setDraggingConditionIndex(null);
  }

  function handleActionDrop(targetIndex: number) {
    if (draggingActionIndex === null) return;
    setActions((prev) => moveInArray(prev, draggingActionIndex, targetIndex));
    setSelectedCanvasNodeId(`action-${targetIndex}`);
    setDraggingActionIndex(null);
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <DashboardModuleHeader
        domain="workflows"
        icon={GitBranch}
        title="Workflows"
        description="Builder visual para automatizaciones secuenciales: trigger, condiciones y acciones con feedback claro."
        actions={(
          <Button variant="outline" onClick={resetDraft} disabled={Boolean(setupState)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo workflow
          </Button>
        )}
        meta={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              Canvas visual secuencial
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              {workflows.length} workflow{workflows.length === 1 ? "" : "s"}
            </Badge>
          </div>
        )}
      />

      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Workflows define <strong className="text-foreground">acciones automaticas</strong> del sistema.
          Si necesitas decidir <strong className="text-foreground">quien atiende</strong> cada conversacion, configura
          esa parte en <strong className="text-foreground">Routing</strong>.
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4 pb-4">
            <div>
              <CardTitle className="text-base">Flujos existentes</CardTitle>
              <CardDescription>Encuentra rapido el flujo correcto y sigue editando sin perder contexto.</CardDescription>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar workflow"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {WORKFLOW_STATUS_FILTERS.map((item) => (
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
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando workflows...</p>
            ) : visibleWorkflows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay workflows que coincidan con el filtro actual.
              </div>
            ) : (
              visibleWorkflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(workflow.id);
                    setStep(1);
                  }}
                  aria-current={selectedId === workflow.id ? "true" : undefined}
                  className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selectedId === workflow.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  {(() => {
                    const health = getWorkflowHealth(workflow);
                    return (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{workflow.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{triggerLabel(workflow.trigger_type)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Actualizado {formatDate(workflow.updated_at)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Ultima corrida: {workflow.last_run_at ? formatDate(workflow.last_run_at) : "Sin ejecucion"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={health.variant}>{health.label}</Badge>
                          <Badge variant="secondary">{workflow.status}</Badge>
                          <Badge variant="outline">24h: {workflow.runs_24h || 0}</Badge>
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
              featureFlags={["workflow_engine_enabled", "workflow_ui_enabled"]}
              onRetry={() => void loadWorkflows()}
            />
          ) : (
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl">{selectedWorkflow ? selectedWorkflow.name : "Nuevo workflow"}</CardTitle>
                    <CardDescription>
                      {selectedWorkflow
                        ? `Editando ${triggerLabel(selectedWorkflow.trigger_type)} · ${selectedWorkflow.is_active ? "activo" : "borrador"}`
                        : "Empieza con una plantilla o define el flujo desde cero."}
                    </CardDescription>
                    {selectedWorkflow ? (
                      <div className="mt-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        Ultima corrida: {selectedWorkflow.last_run_at ? formatDate(selectedWorkflow.last_run_at) : "Sin ejecucion"} ·
                        Estado: {selectedWorkflow.last_run_status || "sin datos"} ·
                        Corridas 24h: {selectedWorkflow.runs_24h || 0} ·
                        Fallidas 24h: {selectedWorkflow.failed_runs_24h || 0}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleSaveNodes} disabled={!selectedWorkflow || saving}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Guardando..." : "Guardar borrador"}
                    </Button>
                    <Button variant="outline" onClick={handleTest} disabled={!selectedWorkflow || testing}>
                      <FlaskConical className="mr-2 h-4 w-4" />
                      {testing ? "Probando..." : "Probar"}
                    </Button>
                    <Button onClick={handlePublish} disabled={!selectedWorkflow || publishing}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {publishing ? "Activando..." : "Activar workflow"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  <div className="sm:col-span-5">
                    <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Progreso del builder</span>
                      <span>{wizardProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600 transition-all duration-200"
                        style={{ width: `${wizardProgress}%` }}
                      />
                    </div>
                  </div>
                  {WIZARD_STEPS.map((wizardStep) => (
                    <button
                      key={wizardStep}
                      type="button"
                      onClick={() => setStep(wizardStep)}
                      className={`rounded-md border px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        step === wizardStep ? "border-primary bg-primary/10" : "hover:bg-muted/30"
                      }`}
                    >
                      <span className="block text-[11px] text-muted-foreground">Paso {wizardStep}</span>
                      <span className="block font-medium text-foreground">{STEP_LABELS[wizardStep]}</span>
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">Flow Canvas</p>
                      <p className="text-xs text-muted-foreground">
                        Vista interactiva: toca una etapa para editarla sin perder el hilo del flujo.
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit text-[10px]">Interactivo</Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        setStep(2);
                        setSelectedCanvasNodeId("trigger");
                      }}
                      className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        step === 2 ? "border-blue-500/50 bg-blue-500/10" : "hover:bg-muted/30"
                      }`}
                    >
                      <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-700 dark:text-blue-300">
                        Trigger
                      </Badge>
                      <p className="mt-2 text-sm font-medium">{summary.trigger}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Evento que inicia el workflow.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStep(3);
                        setSelectedCanvasNodeId(configuredConditions[0] ? "condition-0" : "trigger");
                      }}
                      className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        step === 3 ? "border-amber-500/50 bg-amber-500/10" : "hover:bg-muted/30"
                      }`}
                    >
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                        Condiciones
                      </Badge>
                      <p className="mt-2 text-sm font-medium">{configuredConditions.length} configurada(s)</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {configuredConditions[0]?.value || "Aun no agregas condiciones concretas."}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStep(4);
                        setSelectedCanvasNodeId(configuredActions[0] ? "action-0" : "trigger");
                      }}
                      className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        step === 4 ? "border-emerald-500/50 bg-emerald-500/10" : "hover:bg-muted/30"
                      }`}
                    >
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                        Acciones
                      </Badge>
                      <p className="mt-2 text-sm font-medium">{configuredActions.length} configurada(s)</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {configuredActions[0]?.value || configuredActions[0]?.extra || "Aun no defines acciones con impacto."}
                      </p>
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setConditions((prev) => [...prev, emptyCondition()]);
                        setStep(3);
                        setSelectedCanvasNodeId(`condition-${conditions.length}`);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Agregar condicion
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActions((prev) => [...prev, emptyAction()]);
                        setStep(4);
                        setSelectedCanvasNodeId(`action-${actions.length}`);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Agregar accion
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setStep(5)}>
                      Ver flujo completo
                    </Button>
                  </div>
                </div>

                <div
                  key={step}
                  className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1 motion-safe:duration-200"
                >
                {step === 1 ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 lg:grid-cols-3">
                      {TEMPLATES.map((template, index) => (
                        <button
                          key={template.title}
                          type="button"
                          onClick={() => applyTemplate(index)}
                          className="rounded-xl border p-4 text-left transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Sparkles className="h-4 w-4 text-primary" />
                          <p className="mt-3 text-sm font-semibold">{template.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="workflow-name" className="text-sm font-medium">Nombre</label>
                        <Input
                          id="workflow-name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Ej: Seguimiento compra Instagram"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="workflow-trigger-base" className="text-sm font-medium">Trigger base</label>
                        <select
                          id="workflow-trigger-base"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={triggerType}
                          onChange={(event) => setTriggerType(event.target.value as WorkflowTriggerType)}
                        >
                          {TRIGGERS.map((trigger) => (
                            <option key={trigger.value} value={trigger.value}>{trigger.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="workflow-description" className="text-sm font-medium">Descripcion</label>
                      <Textarea
                        id="workflow-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Explica cuando debe dispararse y que resultado esperas para el equipo."
                      />
                    </div>

                    {!selectedWorkflow ? (
                      <div className="flex justify-end">
                        <Button onClick={handleCreateWorkflow}>
                          <Plus className="mr-2 h-4 w-4" />
                          Crear workflow
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        Este flujo ya existe. Ajusta la base, guarda y luego activa cuando la revision final este correcta.
                      </div>
                    )}
                  </div>
                ) : null}
                {step === 2 ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Cuando se dispara</p>
                      <p className="text-sm text-muted-foreground">Elige un trigger en lenguaje de negocio, no un identificador tecnico.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {TRIGGERS.map((trigger) => {
                        const TriggerIcon = trigger.icon;
                        return (
                          <button
                            key={trigger.value}
                            type="button"
                            onClick={() => setTriggerType(trigger.value)}
                            className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                              triggerType === trigger.value ? "border-primary bg-primary/10" : "hover:bg-muted/30"
                            }`}
                          >
                            <TriggerIcon className="h-5 w-5 text-primary" />
                            <p className="mt-3 text-sm font-semibold">{trigger.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{trigger.help}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {step === 3 ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Condiciones</p>
                      <p className="text-sm text-muted-foreground">Agrega solo las reglas necesarias para que el flujo sea entendible y mantenible.</p>
                    </div>
                    {conditions.map((condition, index) => {
                      const meta = CONDITION_OPTIONS.find((item) => item.value === condition.type);
                      return (
                        <div key={`${condition.type}-${index}`} className="rounded-xl border p-4">
                          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-start">
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tipo</label>
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={condition.type}
                                onChange={(event) => updateCondition(index, { type: event.target.value as WorkflowConditionType, value: "" })}
                              >
                                {CONDITION_OPTIONS.map((item) => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valor</label>
                              <Input
                                value={condition.value}
                                onChange={(event) => updateCondition(index, { value: event.target.value })}
                                placeholder={meta?.placeholder}
                              />
                              <p className="text-xs text-muted-foreground">{meta?.help}</p>
                            </div>
                            <div className="flex items-end justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setConditions((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                                  setSelectedCanvasNodeId("trigger");
                                }}
                                disabled={conditions.length <= 1}
                              >
                                Quitar
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setConditions((prev) => [...prev, emptyCondition()]);
                        setSelectedCanvasNodeId(`condition-${conditions.length}`);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar condicion
                    </Button>
                  </div>
                ) : null}
                {step === 4 ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Acciones</p>
                      <p className="text-sm text-muted-foreground">Cada accion debe ser evidente para cualquier persona del equipo que tome el flujo despues.</p>
                    </div>
                    {actions.map((action, index) => {
                      const meta = ACTION_OPTIONS.find((item) => item.value === action.type);
                      return (
                        <div key={`${action.type}-${index}`} className="rounded-xl border p-4">
                          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_180px_auto] md:items-start">
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Accion</label>
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={action.type}
                                onChange={(event) => updateAction(index, { type: event.target.value as WorkflowActionType, value: "", extra: "" })}
                              >
                                {ACTION_OPTIONS.map((item) => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Configuracion</label>
                              {action.type === "assign_agent" ? (
                                <MemberSelect
                                  id={`workflow-assign-agent-${index}`}
                                  value={action.value}
                                  onChange={(nextValue) => updateAction(index, { value: nextValue })}
                                />
                              ) : (
                                <Input
                                  value={action.value}
                                  onChange={(event) => updateAction(index, { value: event.target.value })}
                                  placeholder={meta?.placeholder}
                                />
                              )}
                              <p className="text-xs text-muted-foreground">{meta?.help}</p>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {meta?.extraLabel || "Extra"}
                              </label>
                              <Input
                                value={action.extra || ""}
                                onChange={(event) => updateAction(index, { extra: event.target.value })}
                                placeholder={meta?.extraLabel || "Opcional"}
                                disabled={!meta?.extraLabel}
                              />
                            </div>
                            <div className="flex items-end justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setActions((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                                  setSelectedCanvasNodeId("trigger");
                                }}
                                disabled={actions.length <= 1}
                              >
                                Quitar
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setActions((prev) => [...prev, emptyAction()]);
                        setSelectedCanvasNodeId(`action-${actions.length}`);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar accion
                    </Button>
                  </div>
                ) : null}
                {step === 5 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-muted/15 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Canvas visual</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Secuencia operacional: Trigger - Condiciones - Acciones. Puedes reordenar condiciones y acciones con drag and drop.
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Secuencial
                        </Badge>
                      </div>
                      <div className="mt-3 hidden items-center justify-center gap-2 text-xs text-muted-foreground md:flex">
                        <span>Trigger</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span>Condiciones</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span>Acciones</span>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_320px]">
                      <div className="grid gap-3 md:grid-cols-3">
                        <section className="space-y-2 rounded-xl border bg-background/80 p-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-700 dark:text-blue-300">
                              Trigger
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">1</span>
                          </div>
                          {visualNodes
                            .filter((node) => node.lane === "trigger")
                            .map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => setSelectedCanvasNodeId(node.id)}
                                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                                  selectedCanvasNodeId === node.id
                                    ? "border-blue-500/50 bg-blue-500/10"
                                    : "hover:bg-muted/40"
                                }`}
                              >
                                <p className="text-sm font-medium">{node.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{node.detail}</p>
                              </button>
                            ))}
                        </section>

                        <section className="space-y-2 rounded-xl border bg-background/80 p-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                              Condiciones
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setConditions((prev) => [...prev, emptyCondition()]);
                                setStep(3);
                                setSelectedCanvasNodeId(`condition-${conditions.length}`);
                              }}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Agregar
                            </Button>
                          </div>
                          {visualConditions.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
                              No hay condiciones activas.
                            </div>
                          ) : (
                            visualConditions.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                draggable
                                onDragStart={() => setDraggingConditionIndex(node.sourceIndex)}
                                onDragOver={(event) => event.preventDefault()}
                                onDragEnd={() => setDraggingConditionIndex(null)}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  handleConditionDrop(node.sourceIndex ?? 0);
                                }}
                                onClick={() => setSelectedCanvasNodeId(node.id)}
                                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                                  selectedCanvasNodeId === node.id
                                    ? "border-amber-500/50 bg-amber-500/10"
                                    : "hover:bg-muted/40"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{node.title}</p>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{node.detail}</p>
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </section>

                        <section className="space-y-2 rounded-xl border bg-background/80 p-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                              Acciones
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setActions((prev) => [...prev, emptyAction()]);
                                setStep(4);
                                setSelectedCanvasNodeId(`action-${actions.length}`);
                              }}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Agregar
                            </Button>
                          </div>
                          {visualActions.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
                              No hay acciones activas.
                            </div>
                          ) : (
                            visualActions.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                draggable
                                onDragStart={() => setDraggingActionIndex(node.sourceIndex)}
                                onDragOver={(event) => event.preventDefault()}
                                onDragEnd={() => setDraggingActionIndex(null)}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  handleActionDrop(node.sourceIndex ?? 0);
                                }}
                                onClick={() => setSelectedCanvasNodeId(node.id)}
                                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                                  selectedCanvasNodeId === node.id
                                    ? "border-emerald-500/50 bg-emerald-500/10"
                                    : "hover:bg-muted/40"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{node.title}</p>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{node.detail}</p>
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </section>
                      </div>

                      <aside className="rounded-xl border bg-background/80 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <LayoutPanelLeft className="h-4 w-4 text-muted-foreground" />
                          Inspector
                        </div>
                        {!selectedCanvasNode ? (
                          <p className="mt-3 text-xs text-muted-foreground">Selecciona un nodo en el canvas para ver detalles.</p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            <Badge variant="outline" className="text-[10px]">
                              {selectedCanvasNode.lane === "trigger"
                                ? "Trigger"
                                : selectedCanvasNode.lane === "condition"
                                  ? "Condicion"
                                  : "Accion"}
                            </Badge>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="text-sm font-medium">{selectedCanvasNode.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{selectedCanvasNode.detail}</p>
                            </div>
                            {selectedConditionDraft ? (
                              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                                <p>
                                  Tipo:{" "}
                                  <strong className="text-foreground">
                                    {CONDITION_OPTIONS.find((item) => item.value === selectedConditionDraft.type)?.label || selectedConditionDraft.type}
                                  </strong>
                                </p>
                                <p className="mt-1">Valor: {selectedConditionDraft.value || "Sin valor"}</p>
                              </div>
                            ) : null}
                            {selectedActionDraft ? (
                              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                                <p>
                                  Accion:{" "}
                                  <strong className="text-foreground">
                                    {ACTION_OPTIONS.find((item) => item.value === selectedActionDraft.type)?.label || selectedActionDraft.type}
                                  </strong>
                                </p>
                                <p className="mt-1">Config: {selectedActionDraft.value || "Sin valor"}</p>
                                {selectedActionDraft.extra ? <p className="mt-1">Extra: {selectedActionDraft.extra}</p> : null}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setStep(
                                    selectedCanvasNode.lane === "trigger"
                                      ? 2
                                      : selectedCanvasNode.lane === "condition"
                                        ? 3
                                        : 4
                                  )
                                }
                              >
                                Editar nodo
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setStep(1)}>
                                Volver a base
                              </Button>
                            </div>
                          </div>
                        )}
                      </aside>
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="text-sm font-medium">Resumen ejecutivo</p>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Si ocurre <strong className="text-foreground">{summary.trigger}</strong>, y se cumplen estas condiciones, el sistema ejecutara las acciones configuradas.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Condiciones aplicadas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                          {summary.conditions.map((item) => (
                            <div key={item} className="rounded-lg border bg-background px-3 py-2">{item}</div>
                          ))}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Acciones resultantes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                          {summary.actions.map((item) => (
                            <div key={item} className="rounded-lg border bg-background px-3 py-2">{item}</div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : null}
                </div>
              </CardContent>
            </Card>
          )}

          {!setupState && !selectedWorkflow && step > 1 ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                <CircleDashed className="h-4 w-4" />
                Crea primero el workflow en el paso Base para poder guardar, probar o activar.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
