import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendWeeklyReportEmail } from "@/lib/email";

type TenantRow = {
  id: string;
  email: string;
  business_name: string | null;
  saas_subscription_status: string | null;
};

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tenants, error: tenantError } = await supabase
      .from("tenants")
      .select("id, email, business_name, saas_subscription_status");

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 500 });
    }

    let reportsSent = 0;
    let skipped = 0;

    for (const tenant of (tenants || []) as TenantRow[]) {
      const email = tenant.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }

      const [{ count: totalMessages }, { count: purchaseIntents }, { count: paymentLinks }, { count: contactsCount }] =
        await Promise.all([
          supabase
            .from("chat_logs")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .gte("created_at", weekAgoIso),
          supabase
            .from("chat_logs")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .eq("intent_detected", "purchase_intent")
            .gte("created_at", weekAgoIso),
          supabase
            .from("chat_logs")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .not("payment_link", "is", null)
            .gte("created_at", weekAgoIso),
          supabase
            .from("contacts")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .gte("last_seen_at", weekAgoIso),
        ]);

      const result = await sendWeeklyReportEmail({
        tenantId: tenant.id,
        to: email,
        businessName: tenant.business_name || "Tu negocio",
        totalMessages: totalMessages || 0,
        purchaseIntents: purchaseIntents || 0,
        paymentLinks: paymentLinks || 0,
        contacts: contactsCount || 0,
      });

      if (result.ok) reportsSent += 1;
    }

    return NextResponse.json({
      success: true,
      tenants_total: (tenants || []).length,
      reports_sent: reportsSent,
      skipped,
      period_start: weekAgoIso,
    });
  } catch (error) {
    console.error("[Cron weekly-report] Error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
