import { createServiceClient } from "@/lib/supabase/server";
import type { ChatChannel, IntentType, LeadStage, RoutingRule } from "@/types";

export interface RoutingContext {
  tenantId: string;
  threadId?: string | null;
  contactId?: string | null;
  channel?: ChatChannel | null;
  intentDetected?: IntentType | null;
  contactTags?: string[];
  leadStage?: LeadStage | null;
  productInterest?: string | null;
}

export interface RoutingDecision {
  matched: boolean;
  ruleId?: string;
  targetTeam?: string;
  targetAgentId?: string | null;
  reason?: string;
}

function toTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

function matchesCondition(rule: RoutingRule, ctx: RoutingContext): boolean {
  const c = (rule.condition || {}) as Record<string, unknown>;

  const channels = toTextArray(c.channels);
  if (channels.length > 0) {
    const channel = String(ctx.channel || "").toLowerCase();
    if (!channels.includes(channel)) return false;
  }

  const intents = toTextArray(c.intents);
  if (intents.length > 0) {
    const intent = String(ctx.intentDetected || "").toLowerCase();
    if (!intents.includes(intent)) return false;
  }

  const requiredTags = toTextArray(c.contact_tags);
  if (requiredTags.length > 0) {
    const tags = new Set((ctx.contactTags || []).map((t) => t.toLowerCase()));
    if (!requiredTags.every((tag) => tags.has(tag))) return false;
  }

  const stages = toTextArray(c.lead_stages);
  if (stages.length > 0) {
    const stage = String(ctx.leadStage || "").toLowerCase();
    if (!stages.includes(stage)) return false;
  }

  const productInterest = String(c.product_interest || "").trim().toLowerCase();
  if (productInterest) {
    const current = String(ctx.productInterest || "").trim().toLowerCase();
    if (current !== productInterest) return false;
  }

  return true;
}

export async function resolveRouting(ctx: RoutingContext): Promise<RoutingDecision> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return { matched: false, reason: error.message };
  }

  const rules = (data as RoutingRule[]) || [];
  const matched = rules.find((rule) => matchesCondition(rule, ctx));
  if (!matched) return { matched: false, reason: "no_rule_matched" };

  return {
    matched: true,
    ruleId: matched.id,
    targetTeam: matched.target_team,
    targetAgentId: matched.target_tenant_user_id,
  };
}

export async function applyRoutingDecision(params: {
  tenantId: string;
  threadId: string;
  contactId?: string | null;
  channel?: ChatChannel | null;
  decision: RoutingDecision;
}): Promise<boolean> {
  if (!params.decision.matched) return false;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const agentId = params.decision.targetAgentId || null;
  const threadUpdate = await supabase
    .from("conversation_threads")
    .update({
      assigned_tenant_user_id: agentId,
      updated_at: now,
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.threadId);

  if (threadUpdate.error) {
    console.warn("[Routing] thread update error:", threadUpdate.error.message);
    return false;
  }

  if (params.contactId) {
    const contactUpdate = await supabase
      .from("contacts")
      .update({
        assigned_tenant_user_id: agentId,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("id", params.contactId);

    if (contactUpdate.error) {
      console.warn("[Routing] contact update error:", contactUpdate.error.message);
    }
  }

  const { error: eventError } = await supabase.from("routing_events").insert({
    tenant_id: params.tenantId,
    rule_id: params.decision.ruleId || null,
    thread_id: params.threadId,
    contact_id: params.contactId || null,
    channel: params.channel || null,
    target_team: params.decision.targetTeam || null,
    target_tenant_user_id: params.decision.targetAgentId || null,
    matched: true,
    reason: params.decision.reason || null,
  });
  if (eventError) {
    console.warn("[Routing] routing_events insert skipped:", eventError.message);
  }

  return true;
}
