import { safeDecrypt, encrypt } from "@/lib/encryption";
import { createServiceClient } from "@/lib/supabase/server";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TimeSlot {
  startTime: string;
  endTime: string;
  status: "available" | "unavailable";
  schedulingUrl?: string;
}

export interface Booking {
  inviteeUuid: string;
  eventName: string;
  startTime: string;
  endTime: string;
  status: "active" | "canceled";
  joinUrl?: string;
  cancelUrl?: string;
  rescheduleUrl?: string;
}

export interface SchedulingAdapter {
  getAvailability(daysAhead?: number): Promise<TimeSlot[]>;
  bookSlot(params: {
    startTime: string;
    name: string;
    email: string;
    customNote?: string;
  }): Promise<Booking | null>;
  cancelBooking(inviteeUuid: string, reason?: string): Promise<boolean>;
  getBooking(inviteeUuid: string): Promise<Booking | null>;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshCalendlyToken(
  tenantId: string,
  refreshToken: string
): Promise<string | null> {
  const clientId     = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      console.error("[scheduling] token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
      created_at:    number;
    };

    // Calendly puede omitir created_at; fallback a Date.now()
    const baseTs = data.created_at ? data.created_at * 1000 : Date.now();
    const expiresAt = new Date(baseTs + (data.expires_in ?? 7200) * 1000).toISOString();

    // Persistir nuevos tokens
    const supabase = createServiceClient();
    await supabase
      .from("tenant_scheduling_configs")
      .update({
        access_token:     encrypt(data.access_token),
        refresh_token:    data.refresh_token ? encrypt(data.refresh_token) : undefined,
        token_expires_at: expiresAt,
        updated_at:       new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    return data.access_token;
  } catch (err) {
    console.error("[scheduling] token refresh error:", err);
    return null;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export async function getSchedulingAdapter(
  tenantId: string
): Promise<SchedulingAdapter | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenant_scheduling_configs")
    .select("provider, access_token, refresh_token, token_expires_at, event_type_uri, timezone")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;

  let token = safeDecrypt(data.access_token);
  if (!token) return null;

  // Refresh proactivo si el token expira en menos de 5 minutos
  if (data.token_expires_at) {
    const expiresAt  = new Date(data.token_expires_at).getTime();
    const fiveMinMs  = 5 * 60 * 1000;
    const isExpiring = Date.now() >= expiresAt - fiveMinMs;

    if (isExpiring && data.refresh_token) {
      const refreshed = safeDecrypt(data.refresh_token);
      if (refreshed) {
        const newToken = await refreshCalendlyToken(tenantId, refreshed);
        if (newToken) token = newToken;
      }
    }
  }

  if (data.provider === "calendly") {
    const { CalendlyAdapter } = await import("./calendly");
    return new CalendlyAdapter(
      token,
      data.event_type_uri || null,
      data.timezone || "America/Santiago"
    );
  }

  return null;
}

export async function getSchedulingConfig(tenantId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenant_scheduling_configs")
    .select("id, provider, event_type_uri, timezone, is_active, token_expires_at, created_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}
