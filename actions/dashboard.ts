"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";

export interface DashboardStats {
  totalMessages: number;
  purchaseIntents: number;
  paymentLinksGenerated: number;
  activeProducts: number;
  totalProducts: number;
  recentLogs: {
    id: string;
    user_message: string;
    bot_response: string;
    intent_detected?: string;
    payment_link?: string;
  }[];
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return null;

  const { supabase, tenantId } = ctx;

  const [statsResult, productsResult, recentLogsResult] = await Promise.all([
    supabase
      .from("chat_logs")
      .select("intent_detected, payment_link")
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
  ]);

  const logs = statsResult.data || [];
  const products = productsResult.data || [];

  return {
    totalMessages: logs.length,
    purchaseIntents: logs.filter((l) => l.intent_detected === "purchase_intent").length,
    paymentLinksGenerated: logs.filter((l) => l.payment_link).length,
    activeProducts: products.filter((p) => p.is_active).length,
    totalProducts: products.length,
    recentLogs: (recentLogsResult.data || []).map((l) => ({
      id: l.id,
      user_message: l.user_message,
      bot_response: l.bot_response,
      intent_detected: l.intent_detected,
      payment_link: l.payment_link,
    })),
  };
}
