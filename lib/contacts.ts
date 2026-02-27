import { createServiceClient } from "@/lib/supabase/server";

function normalizePhone(phone: string): string | null {
  const normalized = phone.replace(/[^0-9+]/g, "").trim();
  return normalized.length >= 8 ? normalized : null;
}

/**
 * Crea o actualiza un contacto en cada mensaje entrante desde canales externos.
 * Garantiza traceabilidad de todos los clientes que escriben (WhatsApp, Instagram, Messenger).
 * Si el contacto no existe, lo crea con datos mínimos; el bot puede completar después con capture_contact_data.
 * Deduplicación: si el contacto tiene phone (ej. WhatsApp identifier) y ya existe otro con ese phone, vincula con canonical_contact_id.
 */
export async function ensureContactExists(params: {
  tenantId: string;
  channel: string;
  identifier: string;
}): Promise<void> {
  const { tenantId, channel, identifier } = params;
  if (!tenantId || !channel || !identifier?.trim()) return;

  try {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .eq("identifier", identifier.trim())
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      await supabase
        .from("contacts")
        .update({ last_seen_at: now })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
    } else {
      let canonicalContactId: string | null = null;
      const phone = channel === "whatsapp" ? normalizePhone(identifier) : null;
      if (phone) {
        const { data: samePhone } = await supabase
          .from("contacts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("phone", phone)
          .limit(1)
          .maybeSingle();
        if (samePhone?.id) canonicalContactId = samePhone.id;
      }

      await supabase.from("contacts").insert({
        tenant_id: tenantId,
        channel,
        identifier: identifier.trim(),
        name: null,
        email: null,
        phone,
        tags: [],
        notes: null,
        metadata: {},
        last_seen_at: now,
        ...(canonicalContactId && { canonical_contact_id: canonicalContactId }),
      });
    }
  } catch (error) {
    console.warn("[contacts] ensureContactExists error:", error);
  }
}
