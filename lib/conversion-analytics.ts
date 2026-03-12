import { createServiceClient } from "@/lib/supabase/server";
import type { AnalyticsActorType, AnalyticsEvent, AnalyticsEventType, ChatChannel } from "@/types";

export interface TrackAnalyticsEventInput {
  tenantId: string;
  eventType: AnalyticsEventType;
  channel?: ChatChannel | null;
  contactId?: string | null;
  threadId?: string | null;
  workflowId?: string | null;
  campaignId?: string | null;
  productId?: string | null;
  amount?: number | null;
  currency?: string | null;
  actorType?: AnalyticsActorType;
  metadata?: Record<string, unknown>;
}

export interface ConversionMetrics {
  period_from: string;
  period_to: string;
  total_conversations_started: number;
  total_lead_stage_changes: number;
  total_payments_completed: number;
  conversion_rate: number;
  sales_by_channel: Array<{ channel: string; amount: number; count: number }>;
  sales_by_product: Array<{ product_id: string; amount: number; count: number }>;
  sales_by_actor: Array<{ actor_type: AnalyticsActorType; amount: number; count: number }>;
}

export async function trackEvent(input: TrackAnalyticsEventInput): Promise<void> {
  if (!input.tenantId) return;

  const supabase = createServiceClient();
  const { error } = await supabase.from("analytics_events").insert({
    tenant_id: input.tenantId,
    event_type: input.eventType,
    channel: input.channel || null,
    contact_id: input.contactId || null,
    thread_id: input.threadId || null,
    workflow_id: input.workflowId || null,
    campaign_id: input.campaignId || null,
    product_id: input.productId || null,
    amount: input.amount ?? null,
    currency: input.currency || null,
    actor_type: input.actorType || "system",
    metadata: input.metadata || {},
  });

  if (error) {
    console.warn("[Analytics] trackEvent error:", error.message);
    return;
  }

  const { data: webhooks } = await supabase
    .from("integration_webhooks")
    .select("target_url, secret, subscribed_events")
    .eq("tenant_id", input.tenantId)
    .eq("is_active", true)
    .contains("subscribed_events", [input.eventType]);

  const hooks = (webhooks || []) as Array<{
    target_url: string;
    secret: string | null;
    subscribed_events: string[];
  }>;

  for (const hook of hooks) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (hook.secret) headers["X-Integration-Secret"] = hook.secret;
      await fetch(hook.target_url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event_type: input.eventType,
          tenant_id: input.tenantId,
          payload: {
            channel: input.channel || null,
            contact_id: input.contactId || null,
            thread_id: input.threadId || null,
            workflow_id: input.workflowId || null,
            campaign_id: input.campaignId || null,
            metadata: input.metadata || {},
          },
        }),
        cache: "no-store",
      });
    } catch (webhookError) {
      console.warn("[Analytics] webhook dispatch error:", webhookError);
    }
  }
}

function toIso(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString();
}

export async function getConversionMetrics(params: {
  tenantId: string;
  from?: string | null;
  to?: string | null;
  channel?: string | null;
}): Promise<ConversionMetrics> {
  const periodTo = toIso(params.to || null, new Date().toISOString());
  const periodFrom = toIso(
    params.from || null,
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  );

  const supabase = createServiceClient();
  let query = supabase
    .from("analytics_events")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .gte("created_at", periodFrom)
    .lte("created_at", periodTo)
    .order("created_at", { ascending: false });

  if (params.channel) {
    query = query.eq("channel", params.channel);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[Analytics] getConversionMetrics error:", error.message);
  }

  const events = ((data as AnalyticsEvent[]) || []).filter(Boolean);

  const started = events.filter((e) => e.event_type === "conversation_started");
  const stageChanges = events.filter((e) => e.event_type === "lead_stage_changed");
  const payments = events.filter((e) => e.event_type === "payment_completed");

  const salesByChannelMap = new Map<string, { amount: number; count: number }>();
  const salesByProductMap = new Map<string, { amount: number; count: number }>();
  const salesByActorMap = new Map<AnalyticsActorType, { amount: number; count: number }>();

  for (const p of payments) {
    const amount = Number(p.amount || 0);
    const channelKey = p.channel || "unknown";
    const productKey = p.product_id || "unknown";
    const actorKey = p.actor_type || "system";

    const c = salesByChannelMap.get(channelKey) || { amount: 0, count: 0 };
    c.amount += amount;
    c.count += 1;
    salesByChannelMap.set(channelKey, c);

    const pr = salesByProductMap.get(productKey) || { amount: 0, count: 0 };
    pr.amount += amount;
    pr.count += 1;
    salesByProductMap.set(productKey, pr);

    const a = salesByActorMap.get(actorKey) || { amount: 0, count: 0 };
    a.amount += amount;
    a.count += 1;
    salesByActorMap.set(actorKey, a);
  }

  const conversionRate = started.length > 0 ? payments.length / started.length : 0;

  return {
    period_from: periodFrom,
    period_to: periodTo,
    total_conversations_started: started.length,
    total_lead_stage_changes: stageChanges.length,
    total_payments_completed: payments.length,
    conversion_rate: conversionRate,
    sales_by_channel: Array.from(salesByChannelMap.entries()).map(([channel, v]) => ({
      channel,
      amount: v.amount,
      count: v.count,
    })),
    sales_by_product: Array.from(salesByProductMap.entries()).map(([product_id, v]) => ({
      product_id,
      amount: v.amount,
      count: v.count,
    })),
    sales_by_actor: Array.from(salesByActorMap.entries()).map(([actor_type, v]) => ({
      actor_type,
      amount: v.amount,
      count: v.count,
    })),
  };
}
