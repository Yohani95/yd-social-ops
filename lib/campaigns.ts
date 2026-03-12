import { createServiceClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/channel-adapters";
import { recordOutboundThreadMessage } from "@/lib/inbox";
import { trackEvent } from "@/lib/conversion-analytics";
import type {
  Campaign,
  CampaignExecutionSummary,
  CampaignContact,
  CampaignStatus,
  CampaignRunStatus,
  ChatChannel,
  Contact,
} from "@/types";

export interface CampaignFilters {
  tag?: string;
  channel?: ChatChannel;
  lead_stage?: string;
}

function parseFilters(input: Record<string, unknown> | null | undefined): CampaignFilters {
  if (!input || typeof input !== "object") return {};
  const data = input as Record<string, unknown>;
  const result: CampaignFilters = {};
  if (typeof data.tag === "string" && data.tag.trim()) result.tag = data.tag.trim().toLowerCase();
  if (typeof data.channel === "string" && data.channel.trim()) result.channel = data.channel.trim() as ChatChannel;
  if (typeof data.lead_stage === "string" && data.lead_stage.trim()) result.lead_stage = data.lead_stage.trim();
  return result;
}

function applyTemplate(template: string, contact: Contact): string {
  const name = (contact.name || "").trim() || "cliente";
  return template
    .replace(/\{\{name\}\}/gi, name)
    .replace(/\{\{identifier\}\}/gi, contact.identifier || "")
    .trim();
}

function extractCampaignMediaUrl(filters: unknown): string | null {
  if (!filters || typeof filters !== "object") return null;
  const value = (filters as Record<string, unknown>).media_url;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  return trimmed;
}

function normalizeSendErrorMessage(raw: unknown): string {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();

  if (!text) return "send_failed";
  if (lower.includes("cannot send messages to this id")) {
    return "Meta rechazo el envio: destinatario no habilitado para recibir este mensaje.";
  }
  if (lower.includes("no se encontro al usuario correspondiente") || lower.includes("error_subcode\":2018001")) {
    return "Meta rechazo el envio: usuario de destino no encontrado o no disponible.";
  }
  if (
    lower.includes("fuera del periodo permitido") ||
    lower.includes("outside the allowed window") ||
    lower.includes("error_subcode\":2534022") ||
    lower.includes("error_subcode\":2018278")
  ) {
    return "Meta rechazo el envio: fuera de la ventana permitida de mensajeria.";
  }

  return text.slice(0, 500);
}

function normalizeChannels(channels: unknown): ChatChannel[] {
  if (!Array.isArray(channels)) return [];
  return channels
    .map((c) => String(c).trim().toLowerCase())
    .filter((c): c is ChatChannel => ["web", "whatsapp", "messenger", "instagram", "tiktok"].includes(c));
}

function looksLikeMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || "").trim();
  const message = String(error.message || "").toLowerCase();
  return code === "42703" || message.includes("column") && message.includes("does not exist");
}

async function updateCampaignState(params: {
  tenantId: string;
  campaignId: string;
  status?: CampaignStatus;
  scheduled_at?: string | null;
  run_status?: CampaignRunStatus;
  last_run_at?: string | null;
  next_run_at?: string | null;
  processed_count?: number;
  sent_count?: number;
  failed_count?: number;
  skipped_count?: number;
}): Promise<void> {
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.status !== undefined) patch.status = params.status;
  if (params.scheduled_at !== undefined) patch.scheduled_at = params.scheduled_at;
  if (params.run_status !== undefined) patch.run_status = params.run_status;
  if (params.last_run_at !== undefined) patch.last_run_at = params.last_run_at;
  if (params.next_run_at !== undefined) patch.next_run_at = params.next_run_at;
  if (params.processed_count !== undefined) patch.processed_count = params.processed_count;
  if (params.sent_count !== undefined) patch.sent_count = params.sent_count;
  if (params.failed_count !== undefined) patch.failed_count = params.failed_count;
  if (params.skipped_count !== undefined) patch.skipped_count = params.skipped_count;

  const { error } = await supabase
    .from("campaigns")
    .update(patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.campaignId);

  if (!error) return;

  // Backward-compatible fallback if operational columns are not deployed yet.
  if (!looksLikeMissingColumnError(error)) {
    throw new Error(error.message);
  }

  const fallbackPatch: Record<string, unknown> = {
    updated_at: patch.updated_at,
  };
  if (params.status !== undefined) fallbackPatch.status = params.status;
  if (params.scheduled_at !== undefined) fallbackPatch.scheduled_at = params.scheduled_at;

  const { error: fallbackError } = await supabase
    .from("campaigns")
    .update(fallbackPatch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.campaignId);

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }
}

async function getCampaignById(tenantId: string, campaignId: string): Promise<Campaign | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", campaignId)
    .maybeSingle();
  return (data as Campaign | null) || null;
}

export async function buildAudience(params: {
  tenantId: string;
  filters?: Record<string, unknown>;
  channels?: ChatChannel[];
}): Promise<Contact[]> {
  const supabase = createServiceClient();
  const filters = parseFilters(params.filters);
  const channels = params.channels && params.channels.length > 0
    ? params.channels
    : normalizeChannels(params.filters?.channels);

  let query = supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(5000);

  if (channels.length > 0) query = query.in("channel", channels);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.lead_stage) query = query.eq("lead_stage", filters.lead_stage);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  const { data, error } = await query;
  if (error) {
    console.warn("[Campaigns] buildAudience error:", error.message);
    return [];
  }
  return (data as Contact[]) || [];
}

export async function scheduleCampaign(params: {
  tenantId: string;
  campaignId: string;
  scheduledAt: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await updateCampaignState({
      tenantId: params.tenantId,
      campaignId: params.campaignId,
      status: "scheduled",
      scheduled_at: params.scheduledAt,
      run_status: "queued",
      next_run_at: params.scheduledAt,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo programar la campana" };
  }
}

export async function sendCampaignBatch(params: {
  tenantId: string;
  campaignId: string;
  batchSize?: number;
}): Promise<{
  ok: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  summary?: CampaignExecutionSummary;
  error?: string;
}> {
  const supabase = createServiceClient();
  const batchSize = Math.max(1, Math.min(params.batchSize || 100, 500));
  const campaign = await getCampaignById(params.tenantId, params.campaignId);
  if (!campaign) return { ok: false, processed: 0, sent: 0, failed: 0, skipped: 0, error: "Campaign not found" };
  if (campaign.status === "cancelled") {
    return { ok: false, processed: 0, sent: 0, failed: 0, skipped: 0, error: "Campaign cancelled" };
  }

  const safeUpdateState = async (
    patch: Omit<Parameters<typeof updateCampaignState>[0], "tenantId" | "campaignId">
  ) => {
    try {
      await updateCampaignState({
        tenantId: params.tenantId,
        campaignId: campaign.id,
        ...patch,
      });
    } catch (error) {
      console.warn("[Campaigns] update state skipped:", error);
    }
  };

  if (campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "running") {
    await safeUpdateState({
      status: "running",
      run_status: "running",
      last_run_at: new Date().toISOString(),
      next_run_at: null,
    });
  }

  const channels = normalizeChannels(campaign.channels);
  const mediaUrl = extractCampaignMediaUrl(campaign.filters);
  const audience = await buildAudience({
    tenantId: params.tenantId,
    filters: campaign.filters,
    channels,
  });

  if (audience.length === 0) {
    await safeUpdateState({
      status: "completed",
      run_status: "completed",
      last_run_at: new Date().toISOString(),
      next_run_at: null,
      processed_count: 0,
      sent_count: 0,
      failed_count: 0,
      skipped_count: 0,
    });
    const summary = await getCampaignExecutionSummary({
      tenantId: params.tenantId,
      campaignId: campaign.id,
    });
    return { ok: true, processed: 0, sent: 0, failed: 0, skipped: 0, summary };
  }

  const queuedRows = audience.map((contact) => ({
    tenant_id: params.tenantId,
    campaign_id: campaign.id,
    contact_id: contact.id,
    channel: contact.channel,
    status: "queued",
  }));

  await supabase.from("campaign_contacts").upsert(queuedRows, { onConflict: "campaign_id,contact_id,channel" });

  const { data: toSend, error: queueError } = await supabase
    .from("campaign_contacts")
    .select("*, contacts(*)")
    .eq("tenant_id", params.tenantId)
    .eq("campaign_id", campaign.id)
    .eq("status", "queued")
    .limit(batchSize);

  if (queueError) {
    await safeUpdateState({
      run_status: "failed",
      last_run_at: new Date().toISOString(),
    });
    return { ok: false, processed: 0, sent: 0, failed: 0, skipped: 0, error: queueError.message };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const rows = (toSend || []) as Array<CampaignContact & { contacts?: Contact }>;
  for (const row of rows) {
    const contact = row.contacts as Contact | undefined;
    if (!contact) {
      skipped += 1;
      await supabase
        .from("campaign_contacts")
        .update({ status: "skipped", error: "contact_not_found", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("tenant_id", params.tenantId);
      continue;
    }

    const message = applyTemplate(campaign.message_template, contact);
    const channel = contact.channel;

    try {
      if (channel !== "web") {
        const { data: channelConfig } = await supabase
          .from("social_channels")
          .select("*")
          .eq("tenant_id", params.tenantId)
          .eq("channel_type", channel)
          .eq("is_active", true)
          .maybeSingle();

        if (!channelConfig) {
          skipped += 1;
          await supabase
            .from("campaign_contacts")
            .update({ status: "skipped", error: "channel_not_active", updated_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("tenant_id", params.tenantId);
          await supabase.from("campaign_events").insert({
            tenant_id: params.tenantId,
            campaign_id: campaign.id,
            contact_id: contact.id,
            event_type: "failed",
            payload: { reason: "channel_not_active", channel },
          });
          await trackEvent({
            tenantId: params.tenantId,
            eventType: "campaign_failed",
            channel,
            contactId: contact.id,
            campaignId: campaign.id,
            actorType: "system",
            metadata: { reason: "channel_not_active" },
          });
          continue;
        }

        const adapter = getAdapter(channel);
        await adapter.sendReply(
          contact.identifier,
          adapter.formatMessage(message),
          channelConfig,
          {
            throwOnError: true,
            mediaUrl: mediaUrl || undefined,
            mediaType: mediaUrl ? "image" : undefined,
          }
        );
      }

      await recordOutboundThreadMessage({
        tenantId: params.tenantId,
        channel,
        userIdentifier: contact.identifier,
        content: message,
        authorType: "bot",
        rawPayload: {
          source: "campaign",
          campaign_id: campaign.id,
        },
      });

      sent += 1;
      await supabase
        .from("campaign_contacts")
        .update({
          status: "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("tenant_id", params.tenantId);

      await supabase.from("campaign_events").insert({
        tenant_id: params.tenantId,
        campaign_id: campaign.id,
        contact_id: contact.id,
        event_type: "sent",
        payload: { channel, message_preview: message.slice(0, 240) },
      });

      await trackEvent({
        tenantId: params.tenantId,
        eventType: "campaign_sent",
        channel,
        contactId: contact.id,
        campaignId: campaign.id,
        actorType: "bot",
      });
    } catch (error) {
      failed += 1;
      const text = normalizeSendErrorMessage(error instanceof Error ? error.message : "send_failed");
      await supabase
        .from("campaign_contacts")
        .update({ status: "failed", error: text, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("tenant_id", params.tenantId);
      await supabase.from("campaign_events").insert({
        tenant_id: params.tenantId,
        campaign_id: campaign.id,
        contact_id: contact.id,
        event_type: "failed",
        payload: { channel, error: text },
      });
      await trackEvent({
        tenantId: params.tenantId,
        eventType: "campaign_failed",
        channel,
        contactId: contact.id,
        campaignId: campaign.id,
        actorType: "system",
        metadata: { error: text },
      });
    }
  }

  const { count: remaining } = await supabase
    .from("campaign_contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq("campaign_id", campaign.id)
    .eq("status", "queued");
  const queued = remaining || 0;
  const status: CampaignStatus = queued === 0 ? "completed" : "running";
  const runStatus: CampaignRunStatus = queued === 0 ? "completed" : "running";
  const totals = await computeCampaignStats({
    tenantId: params.tenantId,
    campaignId: campaign.id,
  });
  const processedTotal = totals.sent + totals.failed + totals.skipped + totals.delivered + totals.read;

  await safeUpdateState({
    status,
    run_status: runStatus,
    last_run_at: new Date().toISOString(),
    next_run_at: queued > 0 ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null,
    processed_count: processedTotal,
    sent_count: totals.sent,
    failed_count: totals.failed,
    skipped_count: totals.skipped,
  });

  const summary = await getCampaignExecutionSummary({
    tenantId: params.tenantId,
    campaignId: campaign.id,
  });

  return {
    ok: true,
    processed: rows.length,
    sent,
    failed,
    skipped,
    summary,
  };
}

export async function computeCampaignStats(params: {
  tenantId: string;
  campaignId: string;
}): Promise<{
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  replied: number;
  by_channel: Array<{
    channel: ChatChannel;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
  }>;
  recent_failures: Array<{
    channel: ChatChannel;
    error: string | null;
    updated_at: string;
    contact_identifier: string | null;
    contact_name: string | null;
  }>;
}> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("campaign_contacts")
    .select("status, channel")
    .eq("tenant_id", params.tenantId)
    .eq("campaign_id", params.campaignId);

  const totals = {
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
    replied: 0,
    by_channel: [] as Array<{
      channel: ChatChannel;
      queued: number;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      skipped: number;
    }>,
    recent_failures: [] as Array<{
      channel: ChatChannel;
      error: string | null;
      updated_at: string;
      contact_identifier: string | null;
      contact_name: string | null;
    }>,
  };

  const perChannel = new Map<ChatChannel, {
    channel: ChatChannel;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
  }>();

  for (const row of (data as Array<Pick<CampaignContact, "status" | "channel">>) || []) {
    if (row.status === "queued") totals.queued += 1;
    if (row.status === "sent") totals.sent += 1;
    if (row.status === "delivered") totals.delivered += 1;
    if (row.status === "read") totals.read += 1;
    if (row.status === "failed") totals.failed += 1;
    if (row.status === "skipped") totals.skipped += 1;

    const current = perChannel.get(row.channel) || {
      channel: row.channel,
      queued: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      skipped: 0,
    };

    if (row.status === "queued") current.queued += 1;
    if (row.status === "sent") current.sent += 1;
    if (row.status === "delivered") current.delivered += 1;
    if (row.status === "read") current.read += 1;
    if (row.status === "failed") current.failed += 1;
    if (row.status === "skipped") current.skipped += 1;

    perChannel.set(row.channel, current);
  }

  const { count: replied } = await supabase
    .from("campaign_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq("campaign_id", params.campaignId)
    .eq("event_type", "replied");

  totals.replied = replied || 0;

  totals.by_channel = Array.from(perChannel.values()).sort((a, b) => a.channel.localeCompare(b.channel));

  const { data: failureRows } = await supabase
    .from("campaign_contacts")
    .select("channel,error,updated_at,contacts(identifier,name)")
    .eq("tenant_id", params.tenantId)
    .eq("campaign_id", params.campaignId)
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(20);

  totals.recent_failures = ((failureRows || []) as Array<{
    channel: ChatChannel;
    error: string | null;
    updated_at: string;
    contacts?: { identifier?: string | null; name?: string | null } | null;
  }>).map((row) => ({
    channel: row.channel,
    error: row.error,
    updated_at: row.updated_at,
    contact_identifier: row.contacts?.identifier || null,
    contact_name: row.contacts?.name || null,
  }));

  return totals;
}

function getNextAction(input: {
  status: CampaignStatus;
  scheduledAt: string | null;
  queued: number;
  sent: number;
  failed: number;
}): Pick<CampaignExecutionSummary, "next_action" | "next_action_detail"> {
  if (input.status === "draft") {
    return {
      next_action: "send_now",
      next_action_detail: "La campana esta en borrador. Ejecuta envio inmediato o programa fecha.",
    };
  }

  if (input.status === "scheduled") {
    const scheduledMs = input.scheduledAt ? Date.parse(input.scheduledAt) : Number.NaN;
    if (Number.isFinite(scheduledMs) && scheduledMs > Date.now()) {
      return {
        next_action: "wait_scheduled",
        next_action_detail: "La campana esta programada. Espera al horario definido o ejecuta manualmente.",
      };
    }
    return {
      next_action: "send_now",
      next_action_detail: "La fecha programada ya vencio. Ejecuta envio para procesar la campana.",
    };
  }

  if (input.status === "running" || input.queued > 0) {
    return {
      next_action: "monitor",
      next_action_detail: "Hay envios en proceso. Monitorea entregas, fallos y cola pendiente.",
    };
  }

  if (input.status === "completed" && input.failed > 0 && input.sent === 0) {
    return {
      next_action: "send_now",
      next_action_detail: "No hubo envios exitosos. Ajusta segmentacion/canales y reintenta.",
    };
  }

  if (input.status === "completed") {
    return {
      next_action: "none",
      next_action_detail: "Campana finalizada. Revisa resultados y crea la siguiente accion comercial.",
    };
  }

  return {
    next_action: "monitor",
    next_action_detail: "Estado intermedio. Revisa detalle de ejecucion.",
  };
}

export async function getCampaignExecutionSummary(params: {
  tenantId: string;
  campaignId: string;
}): Promise<CampaignExecutionSummary> {
  const supabase = createServiceClient();
  const campaign = await getCampaignById(params.tenantId, params.campaignId);

  const defaultSummary: CampaignExecutionSummary = {
    campaign_id: params.campaignId,
    status: "draft",
    scheduled_at: null,
    last_sent_at: null,
    last_failed_at: null,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    queued: 0,
    next_action: "none",
    next_action_detail: "Sin datos de campana.",
  };

  if (!campaign) return defaultSummary;

  const stats = await computeCampaignStats({
    tenantId: params.tenantId,
    campaignId: params.campaignId,
  });

  const [lastSentRes, lastFailedRes] = await Promise.all([
    supabase
      .from("campaign_events")
      .select("created_at")
      .eq("tenant_id", params.tenantId)
      .eq("campaign_id", params.campaignId)
      .eq("event_type", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("campaign_events")
      .select("created_at")
      .eq("tenant_id", params.tenantId)
      .eq("campaign_id", params.campaignId)
      .eq("event_type", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const nextAction = getNextAction({
    status: campaign.status,
    scheduledAt: campaign.scheduled_at,
    queued: stats.queued,
    sent: stats.sent,
    failed: stats.failed,
  });

  return {
    campaign_id: campaign.id,
    status: campaign.status,
    scheduled_at: campaign.scheduled_at,
    last_sent_at: (lastSentRes.data?.created_at as string | undefined) || null,
    last_failed_at: (lastFailedRes.data?.created_at as string | undefined) || null,
    processed: stats.sent + stats.failed + stats.skipped + stats.delivered + stats.read,
    sent: stats.sent,
    failed: stats.failed,
    skipped: stats.skipped,
    queued: stats.queued,
    next_action: nextAction.next_action,
    next_action_detail: nextAction.next_action_detail,
  };
}

export async function processScheduledCampaigns(params?: {
  tenantId?: string;
  limit?: number;
  batchSize?: number;
}): Promise<{
  scanned: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  campaigns: Array<{
    campaign_id: string;
    ok: boolean;
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    error?: string;
  }>;
}> {
  const supabase = createServiceClient();
  const limit = Math.max(1, Math.min(params?.limit || 10, 100));
  const batchSize = Math.max(1, Math.min(params?.batchSize || 200, 500));

  let query = supabase
    .from("campaigns")
    .select("id, tenant_id, status, scheduled_at, updated_at")
    .in("status", ["scheduled", "running"])
    .order("updated_at", { ascending: true })
    .limit(limit * 3);

  if (params?.tenantId) {
    query = query.eq("tenant_id", params.tenantId);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return {
      scanned: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      campaigns: [],
    };
  }

  const now = Date.now();
  const candidates = data as Array<{
    id: string;
    tenant_id: string;
    status: CampaignStatus;
    scheduled_at: string | null;
  }>;
  const campaigns = candidates
    .filter((campaign) => {
      if (campaign.status === "running") return true;
      if (campaign.status !== "scheduled") return false;
      if (!campaign.scheduled_at) return true;
      const scheduledAtMs = Date.parse(campaign.scheduled_at);
      if (Number.isNaN(scheduledAtMs)) return true;
      return scheduledAtMs <= now;
    })
    .slice(0, limit);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const details: Array<{
    campaign_id: string;
    ok: boolean;
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    error?: string;
  }> = [];

  for (const campaign of campaigns) {
    const result = await sendCampaignBatch({
      tenantId: campaign.tenant_id,
      campaignId: campaign.id,
      batchSize,
    });

    if (!result.ok) {
      try {
        await updateCampaignState({
          tenantId: campaign.tenant_id,
          campaignId: campaign.id,
          run_status: "failed",
          last_run_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("[Campaigns] unable to persist failed run status:", error);
      }
    }

    if (result.ok) {
      processed += result.processed;
      sent += result.sent;
      failed += result.failed;
      skipped += result.skipped;
    }
    details.push({
      campaign_id: campaign.id,
      ok: result.ok,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      error: result.error,
    });
  }

  return {
    scanned: campaigns.length,
    processed,
    sent,
    failed,
    skipped,
    campaigns: details,
  };
}
