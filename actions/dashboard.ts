"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";

export interface ChannelStat {
  channel: string;
  count: number;
  intents: number;
  payments: number;
}

export interface DailyMessages {
  date: string;   // YYYY-MM-DD
  count: number;
  intents: number;
  payments: number;
}

export interface IntentStat {
  intent: string;
  count: number;
}

export interface DashboardStats {
  totalMessages: number;
  purchaseIntents: number;
  paymentLinksGenerated: number;
  activeProducts: number;
  totalProducts: number;
  totalContacts: number;
  messagesLast7Days: number;
  messagesLast30Days: number;
  channelBreakdown: ChannelStat[];
  messagesPerDay: DailyMessages[];
  intentBreakdown: IntentStat[];
  conversionFunnel: { stage: string; value: number }[];
  recentLogs: {
    id: string;
    user_message: string;
    bot_response: string;
    intent_detected?: string;
    payment_link?: string;
    channel?: string;
    created_at?: string;
  }[];
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return null;

  const { supabase, tenantId } = ctx;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [statsResult, productsResult, recentLogsResult, contactsResult, last7Result, last30Result] =
    await Promise.all([
      supabase
        .from("chat_logs")
        .select("intent_detected, payment_link, channel, created_at")
        .eq("tenant_id", tenantId),
      supabase
        .from("products")
        .select("id, is_active")
        .eq("tenant_id", tenantId),
      supabase
        .from("chat_logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", thirtyDaysAgo),
    ]);

  const logs = statsResult.data || [];
  const products = productsResult.data || [];

  // Channel breakdown
  const channelMap = new Map<string, ChannelStat>();
  for (const log of logs) {
    const ch = log.channel || "web";
    const existing = channelMap.get(ch) || { channel: ch, count: 0, intents: 0, payments: 0 };
    existing.count++;
    if (log.intent_detected === "purchase_intent") existing.intents++;
    if (log.payment_link) existing.payments++;
    channelMap.set(ch, existing);
  }

  // Messages per day (last 30 days)
  const dayMap = new Map<string, DailyMessages>();
  // Pre-fill all 30 days
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    dayMap.set(dateStr, { date: dateStr, count: 0, intents: 0, payments: 0 });
  }
  for (const log of logs) {
    if (!log.created_at) continue;
    const dateStr = log.created_at.slice(0, 10);
    const existing = dayMap.get(dateStr);
    if (existing) {
      existing.count++;
      if (log.intent_detected === "purchase_intent") existing.intents++;
      if (log.payment_link) existing.payments++;
    }
  }

  // Intent breakdown
  const intentMap = new Map<string, number>();
  for (const log of logs) {
    const intent = log.intent_detected || "unknown";
    intentMap.set(intent, (intentMap.get(intent) || 0) + 1);
  }
  const intentBreakdown = Array.from(intentMap.entries())
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count);

  // Conversion funnel
  const totalMsg = logs.length;
  const purchases = logs.filter((l) => l.intent_detected === "purchase_intent").length;
  const payments = logs.filter((l) => l.payment_link).length;
  const conversionFunnel = [
    { stage: "Mensajes", value: totalMsg },
    { stage: "Intención compra", value: purchases },
    { stage: "Link de pago", value: payments },
  ];

  return {
    totalMessages: logs.length,
    purchaseIntents: purchases,
    paymentLinksGenerated: payments,
    activeProducts: products.filter((p) => p.is_active).length,
    totalProducts: products.length,
    totalContacts: contactsResult.count || 0,
    messagesLast7Days: last7Result.count || 0,
    messagesLast30Days: last30Result.count || 0,
    channelBreakdown: Array.from(channelMap.values()).sort((a, b) => b.count - a.count),
    messagesPerDay: Array.from(dayMap.values()),
    intentBreakdown,
    conversionFunnel,
    recentLogs: (recentLogsResult.data || []).map((l) => ({
      id: l.id,
      user_message: l.user_message,
      bot_response: l.bot_response,
      intent_detected: l.intent_detected,
      payment_link: l.payment_link,
      channel: l.channel,
      created_at: l.created_at,
    })),
  };
}
