import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/calendly
 *
 * Eventos manejados:
 * - invitee.created → upsert contact con nombre/email + tag calendly_booking
 *                   → insertar mensaje de sistema en su thread (si existe)
 * - invitee.canceled → actualizar tag a calendly_canceled
 *
 * Tenant resolution: event_type URI del payload → tenant_scheduling_configs.event_type_uri
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // ── Verificar firma ──────────────────────────────────────────────────────
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const signature = request.headers.get("calendly-webhook-signature") || "";
    const timestamp  = request.headers.get("calendly-webhook-timestamp") || Date.now().toString();
    const expected   = `v1=${crypto
      .createHmac("sha256", signingKey)
      .update(`${timestamp}.${rawBody}`)
      .digest("base64")}`;
    if (signature !== expected) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event as string;
  const payload   = event.payload as Record<string, unknown> | undefined;
  if (!payload) return NextResponse.json({ ok: true, skipped: "no_payload" });

  // ── Extraer datos del invitado ───────────────────────────────────────────
  const inviteeEmail   = (payload.email as string | undefined)?.toLowerCase().trim() || "";
  const inviteeName    = (payload.name  as string | undefined)?.trim() || "";
  const cancelUrl      = payload.cancel_url      as string | undefined;
  const rescheduleUrl  = payload.reschedule_url  as string | undefined;

  const scheduledEvent = payload.scheduled_event as Record<string, unknown> | undefined;
  const startTime      = scheduledEvent?.start_time as string | undefined;
  const eventName      = scheduledEvent?.name       as string | undefined;
  const eventTypeUri   = scheduledEvent?.event_type as string | undefined; // URI del event type

  // ── Resolver tenant desde event_type_uri ────────────────────────────────
  const supabase = createServiceClient();
  let tenantId: string | null = null;

  if (eventTypeUri) {
    const { data: sc } = await supabase
      .from("tenant_scheduling_configs")
      .select("tenant_id")
      .eq("event_type_uri", eventTypeUri)
      .eq("is_active", true)
      .maybeSingle();
    tenantId = sc?.tenant_id ?? null;
  }

  if (!tenantId) {
    // Fallback: buscar por email del host en event_memberships
    const memberships = payload.event_memberships as Array<{ user_email?: string }> | undefined;
    const hostEmail   = memberships?.[0]?.user_email?.toLowerCase().trim();
    if (hostEmail) {
      const { data: tenantUser } = await supabase
        .from("tenant_users")
        .select("tenant_id")
        .eq("email", hostEmail)
        .maybeSingle();
      tenantId = tenantUser?.tenant_id ?? null;
    }
  }

  if (!tenantId) {
    console.warn("[calendly/webhook] No se pudo resolver tenant para evento:", eventType, eventTypeUri);
    return NextResponse.json({ ok: true, skipped: "tenant_not_found" });
  }

  // ── invitee.created ──────────────────────────────────────────────────────
  if (eventType === "invitee.created") {
    console.info(`[calendly/webhook] Booking: ${inviteeName} <${inviteeEmail}> tenant:${tenantId}`);

    if (!inviteeEmail) {
      return NextResponse.json({ ok: true, skipped: "no_email" });
    }

    // Upsert contact: crear si no existe, actualizar nombre/email/tags si existe
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, tags, name")
      .eq("tenant_id", tenantId)
      .eq("identifier", inviteeEmail)
      .maybeSingle();

    const now  = new Date().toISOString();
    const tags: string[] = Array.isArray(existing?.tags) ? existing.tags : [];
    if (!tags.includes("calendly_booking")) tags.push("calendly_booking");

    if (existing) {
      await supabase
        .from("contacts")
        .update({
          name:               existing.name || inviteeName || null,
          email:              inviteeEmail,
          tags,
          last_seen_at:       now,
          last_interaction_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("contacts").insert({
        tenant_id:           tenantId,
        channel:             "calendly",
        identifier:          inviteeEmail,
        name:                inviteeName || null,
        email:               inviteeEmail,
        tags,
        last_seen_at:        now,
        last_interaction_at: now,
        created_at:          now,
      });
    }

    // Insertar mensaje de sistema en thread si existe un thread vinculado a este contact
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("identifier", inviteeEmail)
      .maybeSingle();

    if (contact) {
      const { data: thread } = await supabase
        .from("conversation_threads")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("contact_id", contact.id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (thread) {
        const timeStr = startTime
          ? new Date(startTime).toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" })
          : "a confirmar";
        await supabase.from("conversation_messages").insert({
          tenant_id:   tenantId,
          thread_id:   thread.id,
          direction:   "inbound",
          author_type: "system",
          content:     `📅 Cita confirmada: "${eventName || "Reunión"}" — ${timeStr}`,
          raw_payload: {
            source:         "calendly_webhook",
            event_type:     "invitee.created",
            invitee_email:  inviteeEmail,
            invitee_name:   inviteeName,
            start_time:     startTime,
            cancel_url:     cancelUrl,
            reschedule_url: rescheduleUrl,
          },
          created_at: now,
        });
      }
    }
  }

  // ── invitee.canceled ─────────────────────────────────────────────────────
  if (eventType === "invitee.canceled") {
    console.info(`[calendly/webhook] Canceled: ${inviteeName} <${inviteeEmail}> tenant:${tenantId}`);

    if (inviteeEmail) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("tenant_id", tenantId)
        .eq("identifier", inviteeEmail)
        .maybeSingle();

      if (contact) {
        const tags: string[] = Array.isArray(contact.tags) ? contact.tags : [];
        if (!tags.includes("calendly_canceled")) tags.push("calendly_canceled");

        await supabase
          .from("contacts")
          .update({ tags })
          .eq("id", contact.id);

        // Nota en thread si existe
        const { data: thread } = await supabase
          .from("conversation_threads")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("contact_id", contact.id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (thread) {
          await supabase.from("conversation_messages").insert({
            tenant_id:   tenantId,
            thread_id:   thread.id,
            direction:   "inbound",
            author_type: "system",
            content:     `❌ Cita cancelada: "${eventName || "Reunión"}" — ${inviteeName} (${inviteeEmail})`,
            raw_payload: { source: "calendly_webhook", event_type: "invitee.canceled" },
            created_at:  new Date().toISOString(),
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
