import { createServiceClient } from "@/lib/supabase/server";
import { createMerchantPaymentLink } from "@/lib/merchant-payment-links";
import { resolveRouting, applyRoutingDecision } from "@/lib/routing";
import { trackEvent } from "@/lib/conversion-analytics";
import type {
  AutomationNode,
  AutomationWorkflow,
  LeadStage,
  WorkflowActionType,
  WorkflowConditionType,
  WorkflowContext,
  WorkflowRunStatus,
} from "@/types";

export interface WorkflowActionExecution {
  action: WorkflowActionType;
  ok: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowRunResult {
  workflowId: string;
  matched: boolean;
  status: WorkflowRunStatus;
  stopProcessing: boolean;
  outboundMessages: string[];
  actions: WorkflowActionExecution[];
  error?: string;
}

export interface WorkflowOutcome {
  matchedWorkflows: number;
  stopProcessing: boolean;
  outboundMessages: string[];
  runs: WorkflowRunResult[];
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

function applyTemplate(template: string, ctx: WorkflowContext, extra?: Record<string, unknown>): string {
  const source: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    channel: ctx.channel || "",
    message: ctx.message || "",
    intent: ctx.intentDetected || "",
    payment_status: ctx.paymentStatus || "",
    product_interest: ctx.productInterest || "",
    sender_id: ctx.senderId || "",
    ...(ctx.metadata || {}),
    ...(extra || {}),
  };

  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = source[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

async function createRun(params: {
  tenantId: string;
  workflowId: string;
  context: WorkflowContext;
}): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("automation_runs")
    .insert({
      tenant_id: params.tenantId,
      workflow_id: params.workflowId,
      trigger_event_id: params.context.triggerEventId || null,
      status: "running",
      run_context: params.context,
      started_at: new Date().toISOString(),
      dedupe_key: params.context.triggerEventId || null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[WorkflowEngine] createRun error:", error.message);
    return null;
  }
  return (data?.id as string | undefined) || null;
}

async function updateRun(runId: string | null, input: {
  status: WorkflowRunStatus;
  executionLog: Array<Record<string, unknown>>;
  error?: string;
}): Promise<void> {
  if (!runId) return;
  const supabase = createServiceClient();
  await supabase
    .from("automation_runs")
    .update({
      status: input.status,
      execution_log: input.executionLog,
      error_message: input.error || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export function evaluateCondition(
  condition: { type: WorkflowConditionType; config?: Record<string, unknown> },
  context: WorkflowContext
): boolean {
  const config = asRecord(condition.config);

  if (condition.type === "message_contains") {
    const message = (context.message || "").toLowerCase();
    const keywords = asStringArray(config.keywords || config.value);
    if (keywords.length === 0) return true;
    return keywords.some((keyword) => message.includes(keyword));
  }

  if (condition.type === "intent_detected") {
    const intents = asStringArray(config.intents || config.value);
    if (intents.length === 0) return true;
    return intents.includes(String(context.intentDetected || "").toLowerCase());
  }

  if (condition.type === "channel") {
    const channels = asStringArray(config.channels || config.value);
    if (channels.length === 0) return true;
    return channels.includes(String(context.channel || "").toLowerCase());
  }

  if (condition.type === "contact_tag") {
    const tags = new Set((context.contactTags || []).map((t) => t.toLowerCase()));
    const requiredTags = asStringArray(config.tags || config.value);
    if (requiredTags.length === 0) return true;
    return requiredTags.every((tag) => tags.has(tag));
  }

  if (condition.type === "product_interest") {
    const values = asStringArray(config.values || config.value);
    if (values.length === 0) return true;
    return values.includes(String(context.productInterest || "").toLowerCase());
  }

  if (condition.type === "payment_status") {
    const values = asStringArray(config.values || config.value);
    if (values.length === 0) return true;
    return values.includes(String(context.paymentStatus || "").toLowerCase());
  }

  return true;
}

async function updateLeadStage(params: {
  tenantId: string;
  contactId?: string | null;
  threadId?: string | null;
  stage: LeadStage;
  value?: number | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const leadValue = Number(params.value || 0);

  if (params.contactId) {
    await supabase
      .from("contacts")
      .update({
        lead_stage: params.stage,
        lead_value: leadValue,
        last_interaction_at: now,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("id", params.contactId);
  }

  if (params.threadId) {
    await supabase
      .from("conversation_threads")
      .update({
        lead_stage_snapshot: params.stage,
        lead_value_snapshot: leadValue,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("id", params.threadId);
  }
}

export async function executeAction(
  action: { type: WorkflowActionType; config?: Record<string, unknown> },
  context: WorkflowContext
): Promise<{ execution: WorkflowActionExecution; outboundMessages: string[]; stopProcessing?: boolean }> {
  const config = asRecord(action.config);
  const outboundMessages: string[] = [];

  if (action.type === "send_message") {
    const message = applyTemplate(String(config.message || ""), context);
    if (message) outboundMessages.push(message);
    return {
      execution: {
        action: action.type,
        ok: Boolean(message),
        metadata: { message_length: message.length },
      },
      outboundMessages,
      stopProcessing: config.stop_ai !== false,
    };
  }

  if (action.type === "generate_payment_link") {
    const amountClp = Number(config.amount_clp || config.amount || 0);
    const title = String(config.title || "Pago");
    const result = await createMerchantPaymentLink({
      tenantId: context.tenantId,
      title,
      description: typeof config.description === "string" ? config.description : null,
      amountClp,
      quantity: Number(config.quantity || 1),
      channel: context.channel || null,
      threadId: context.threadId || null,
      contactId: context.contactId || null,
      createdBy: "bot",
    });

    if (!result.ok || !result.link) {
      return {
        execution: {
          action: action.type,
          ok: false,
          message: result.error || "payment_link_failed",
        },
        outboundMessages,
      };
    }

    const url = result.link.mp_init_point || "";
    if (url) {
      const base = String(config.message || "Te comparto tu link de pago: {{payment_link}}");
      outboundMessages.push(applyTemplate(base, context, { payment_link: url }));
    }
    await trackEvent({
      tenantId: context.tenantId,
      eventType: "payment_link_generated",
      channel: context.channel || null,
      contactId: context.contactId || null,
      threadId: context.threadId || null,
      actorType: "bot",
      metadata: {
        merchant_payment_link_id: result.link.id,
      },
    });

    return {
      execution: {
        action: action.type,
        ok: true,
        metadata: {
          link_id: result.link.id,
          payment_link: url,
        },
      },
      outboundMessages,
      stopProcessing: config.stop_ai !== false,
    };
  }

  if (action.type === "assign_agent") {
    const targetAgentId =
      typeof config.target_agent_id === "string" && config.target_agent_id.trim()
        ? config.target_agent_id.trim()
        : null;

    let applied = false;
    if (context.threadId && targetAgentId) {
      const supabase = createServiceClient();
      const now = new Date().toISOString();
      await supabase
        .from("conversation_threads")
        .update({ assigned_tenant_user_id: targetAgentId, updated_at: now })
        .eq("tenant_id", context.tenantId)
        .eq("id", context.threadId);
      if (context.contactId) {
        await supabase
          .from("contacts")
          .update({ assigned_tenant_user_id: targetAgentId, updated_at: now })
          .eq("tenant_id", context.tenantId)
          .eq("id", context.contactId);
      }
      applied = true;
    } else if (context.threadId) {
      const decision = await resolveRouting({
        tenantId: context.tenantId,
        threadId: context.threadId,
        contactId: context.contactId || null,
        channel: context.channel || null,
        intentDetected: context.intentDetected || null,
        contactTags: context.contactTags || [],
      });
      if (decision.matched) {
        applied = await applyRoutingDecision({
          tenantId: context.tenantId,
          threadId: context.threadId,
          contactId: context.contactId || null,
          decision,
        });
      }
    }

    return {
      execution: {
        action: action.type,
        ok: applied,
        metadata: { assigned: applied, target_agent_id: targetAgentId },
      },
      outboundMessages,
    };
  }

  if (action.type === "change_lead_stage") {
    const stage = String(config.stage || "").trim() as LeadStage;
    if (!["new", "contacted", "qualified", "interested", "checkout", "customer", "lost"].includes(stage)) {
      return {
        execution: {
          action: action.type,
          ok: false,
          message: "invalid_stage",
        },
        outboundMessages,
      };
    }
    await updateLeadStage({
      tenantId: context.tenantId,
      contactId: context.contactId || null,
      threadId: context.threadId || null,
      stage,
      value: Number(config.lead_value || 0),
    });
    await trackEvent({
      tenantId: context.tenantId,
      eventType: "lead_stage_changed",
      channel: context.channel || null,
      contactId: context.contactId || null,
      threadId: context.threadId || null,
      actorType: "system",
      metadata: { stage },
    });

    return {
      execution: {
        action: action.type,
        ok: true,
        metadata: { stage },
      },
      outboundMessages,
    };
  }

  if (action.type === "add_tag") {
    const tag = String(config.tag || "").trim().toLowerCase();
    if (!context.contactId || !tag) {
      return {
        execution: {
          action: action.type,
          ok: false,
          message: "missing_contact_or_tag",
        },
        outboundMessages,
      };
    }
    const supabase = createServiceClient();
    const { data: contact } = await supabase
      .from("contacts")
      .select("tags")
      .eq("tenant_id", context.tenantId)
      .eq("id", context.contactId)
      .maybeSingle();
    const tags = new Set((contact?.tags || []).map((t: string) => String(t).toLowerCase()));
    tags.add(tag);
    await supabase
      .from("contacts")
      .update({
        tags: Array.from(tags),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", context.tenantId)
      .eq("id", context.contactId);
    return {
      execution: {
        action: action.type,
        ok: true,
        metadata: { tag },
      },
      outboundMessages,
    };
  }

  if (action.type === "call_webhook") {
    const url = String(config.url || config.webhook_url || "").trim();
    if (!url) {
      return {
        execution: {
          action: action.type,
          ok: false,
          message: "missing_url",
        },
        outboundMessages,
      };
    }
    const payload = {
      tenant_id: context.tenantId,
      trigger_type: context.triggerType,
      context,
      ...(asRecord(config.payload) || {}),
    };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (typeof config.secret === "string" && config.secret.trim()) {
      headers["X-Workflow-Secret"] = config.secret.trim();
    }
    const res = await fetch(url, {
      method: String(config.method || "POST").toUpperCase(),
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return {
      execution: {
        action: action.type,
        ok: res.ok,
        metadata: { status: res.status, url },
      },
      outboundMessages,
    };
  }

  if (action.type === "delay") {
    const ms = Math.max(0, Math.min(Number(config.ms || config.delay_ms || 0), 30_000));
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return {
      execution: {
        action: action.type,
        ok: true,
        metadata: { ms },
      },
      outboundMessages,
    };
  }

  return {
    execution: {
      action: action.type,
      ok: false,
      message: "unknown_action",
    },
    outboundMessages,
  };
}

async function getWorkflowNodes(tenantId: string, workflowId: string): Promise<AutomationNode[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("automation_nodes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("workflow_id", workflowId)
    .order("sequence_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as AutomationNode[]) || [];
}

export async function executeWorkflow(
  workflowId: string,
  context: WorkflowContext
): Promise<WorkflowRunResult> {
  const runId = await createRun({ tenantId: context.tenantId, workflowId, context });
  const executionLog: Array<Record<string, unknown>> = [];
  const outboundMessages: string[] = [];
  let stopProcessing = false;

  try {
    const nodes = await getWorkflowNodes(context.tenantId, workflowId);
    const conditionNodes = nodes.filter((n) => n.node_type === "condition");
    const actionNodes = nodes.filter((n) => n.node_type === "action");

    for (const node of conditionNodes) {
      const config = asRecord(node.config);
      const type = String(config.type || "").trim() as WorkflowConditionType;
      const passed = evaluateCondition({ type, config }, context);
      executionLog.push({
        node_id: node.id,
        node_type: node.node_type,
        condition_type: type,
        passed,
      });
      if (!passed) {
        const result: WorkflowRunResult = {
          workflowId,
          matched: false,
          status: "cancelled",
          stopProcessing: false,
          outboundMessages: [],
          actions: [],
        };
        await updateRun(runId, {
          status: "cancelled",
          executionLog,
        });
        return result;
      }
    }

    const actions: WorkflowActionExecution[] = [];
    for (const node of actionNodes) {
      const config = asRecord(node.config);
      const type = String(config.type || "").trim() as WorkflowActionType;
      const result = await executeAction({ type, config }, context);
      actions.push(result.execution);
      outboundMessages.push(...result.outboundMessages);
      executionLog.push({
        node_id: node.id,
        node_type: node.node_type,
        action_type: type,
        ok: result.execution.ok,
      });
      if (result.stopProcessing) {
        stopProcessing = true;
      }
    }

    await updateRun(runId, {
      status: "succeeded",
      executionLog,
    });

    await trackEvent({
      tenantId: context.tenantId,
      eventType: "workflow_executed",
      channel: context.channel || null,
      contactId: context.contactId || null,
      threadId: context.threadId || null,
      workflowId,
      actorType: "system",
      metadata: {
        trigger_type: context.triggerType,
        matched: true,
      },
    });

    return {
      workflowId,
      matched: true,
      status: "succeeded",
      stopProcessing,
      outboundMessages,
      actions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow_execution_failed";
    executionLog.push({ error: message });
    await updateRun(runId, {
      status: "failed",
      executionLog,
      error: message,
    });
    return {
      workflowId,
      matched: false,
      status: "failed",
      stopProcessing: false,
      outboundMessages: [],
      actions: [],
      error: message,
    };
  }
}

async function listActiveWorkflows(params: {
  tenantId: string;
  triggerType: WorkflowContext["triggerType"];
}): Promise<AutomationWorkflow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("automation_workflows")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("is_active", true)
    .eq("status", "published")
    .eq("trigger_type", params.triggerType)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data as AutomationWorkflow[]) || [];
}

export async function evaluateWorkflows(context: WorkflowContext): Promise<WorkflowOutcome> {
  const workflows = await listActiveWorkflows({
    tenantId: context.tenantId,
    triggerType: context.triggerType,
  });

  const runs: WorkflowRunResult[] = [];
  const outboundMessages: string[] = [];
  let stopProcessing = false;
  let matchedWorkflows = 0;

  for (const workflow of workflows) {
    const run = await executeWorkflow(workflow.id, context);
    runs.push(run);
    if (run.matched) matchedWorkflows += 1;
    outboundMessages.push(...run.outboundMessages);
    if (run.stopProcessing) stopProcessing = true;
  }

  return {
    matchedWorkflows,
    stopProcessing,
    outboundMessages,
    runs,
  };
}

