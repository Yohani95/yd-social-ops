import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendLeadFollowUpEmail } from "@/lib/email";

type ContactRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
};

type TenantRow = {
  id: string;
  business_name: string | null;
};

function withTag(tags: string[] | null, tag: string): string[] {
  const next = new Set((tags || []).map((t) => t.trim()).filter(Boolean));
  next.add(tag);
  return Array.from(next);
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const coldSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, tenant_id, name, email, tags, metadata, last_seen_at")
      .lt("last_seen_at", coldSince);

    if (contactsError) {
      return NextResponse.json({ error: contactsError.message }, { status: 500 });
    }

    const coldContacts = (contacts || []) as ContactRow[];
    let tagged = 0;
    let followUpsSent = 0;

    const tenantIds = Array.from(new Set(coldContacts.map((c) => c.tenant_id)));
    const tenantMap = new Map<string, TenantRow>();

    if (tenantIds.length > 0) {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, business_name")
        .in("id", tenantIds);

      for (const tenant of (tenants || []) as TenantRow[]) {
        tenantMap.set(tenant.id, tenant);
      }
    }

    const followUpEnabled = process.env.COLD_LEADS_EMAIL_ENABLED === "true";

    for (const contact of coldContacts) {
      const wasCold = (contact.tags || []).includes("cold");
      const tags = withTag(contact.tags, "cold");
      const metadataBase = { ...(contact.metadata || {}) };

      if (!wasCold) {
        const metadata = {
          ...metadataBase,
          cold_tagged_at: new Date().toISOString(),
        };
        const { error: updateError } = await supabase
          .from("contacts")
          .update({
            tags,
            updated_at: new Date().toISOString(),
            metadata,
          })
          .eq("id", contact.id)
          .eq("tenant_id", contact.tenant_id);

        if (!updateError) tagged += 1;
      }

      const followUpAlreadySent = Boolean(metadataBase.cold_followup_sent_at);
      if (followUpEnabled && !followUpAlreadySent && contact.email?.trim()) {
        const tenant = tenantMap.get(contact.tenant_id);
        const result = await sendLeadFollowUpEmail({
          tenantId: contact.tenant_id,
          to: contact.email.trim(),
          contactName: contact.name,
          businessName: tenant?.business_name || "Nuestro negocio",
        });
        if (result.ok) {
          followUpsSent += 1;
          const metadata = {
            ...metadataBase,
            cold_followup_sent_at: new Date().toISOString(),
          };
          await supabase
            .from("contacts")
            .update({
              tags,
              metadata,
              updated_at: new Date().toISOString(),
            })
            .eq("id", contact.id)
            .eq("tenant_id", contact.tenant_id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      threshold: coldSince,
      contacts_found: coldContacts.length,
      contacts_tagged: tagged,
      followups_sent: followUpsSent,
      followup_enabled: followUpEnabled,
    });
  } catch (error) {
    console.error("[Cron cold-leads] Error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
