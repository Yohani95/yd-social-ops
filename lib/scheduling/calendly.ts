import type { SchedulingAdapter, TimeSlot, Booking } from "./index";

/**
 * Calendly API v2 Adapter
 * Docs: https://developer.calendly.com/api-docs/
 *
 * Booking flow (bot):
 *  1. getUserUri()              → /users/me
 *  2. getEventType()            → /event_types?user=uri
 *  3. getAvailability()         → /event_type_available_times
 *  4. bookSlot()                → POST /one_off_event_types  (date-restricted link)
 *  5. cancelBooking()           → POST /scheduled_events/{uuid}/cancellation
 */
export class CalendlyAdapter implements SchedulingAdapter {
  private readonly token: string;
  private readonly eventTypeUri: string | null;
  private readonly timezone: string;
  private readonly baseUrl = "https://api.calendly.com";

  constructor(token: string, eventTypeUri: string | null, timezone: string) {
    this.token      = token;
    this.eventTypeUri = eventTypeUri;
    this.timezone   = timezone;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`Calendly ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private async apiPost<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Calendly POST ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  /** URI del usuario autenticado */
  private async getUserUri(): Promise<string> {
    const data = await this.apiFetch<{ resource: { uri: string } }>("/users/me");
    return data.resource.uri;
  }

  /** Primer event type activo del tenant */
  private async resolveEventType(): Promise<{
    uri: string; name: string; duration: number; scheduling_url: string;
  } | null> {
    if (this.eventTypeUri) {
      // Obtener por UUID (extrae de la URI completa)
      const uuid = this.eventTypeUri.split("/").pop()!;
      const et = await this.apiFetch<{
        resource: { uri: string; name: string; duration: number; scheduling_url: string };
      }>(`/event_types/${uuid}`);
      return et.resource;
    }
    // Auto-descubrir
    const userUri = await this.getUserUri();
    const list = await this.apiFetch<{
      collection: Array<{ uri: string; name: string; duration: number; scheduling_url: string }>;
    }>("/event_types", { user: userUri, active: "true", count: "1" });
    return list.collection[0] ?? null;
  }

  // ── SchedulingAdapter impl ────────────────────────────────────────────────────

  async getAvailability(daysAhead = 7): Promise<TimeSlot[]> {
    try {
      const et = await this.resolveEventType();
      if (!et) return [];

      // Calendly requiere start_time en el futuro — buffer de 15 min
      const startTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      // Máximo 7 días según límite de la API
      const days      = Math.min(daysAhead, 7);
      const endTime   = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const availability = await this.apiFetch<{
        collection: Array<{
          start_time: string;
          end_time:   string;
          status:     "available" | "unavailable";
        }>;
      }>("/event_type_available_times", {
        event_type: et.uri,
        start_time: startTime,
        end_time:   endTime,
      });

      return (availability.collection ?? [])
        .filter((s) => s.status === "available")
        .map((s) => ({
          startTime:     s.start_time,
          endTime:       s.end_time,
          status:        "available" as const,
          schedulingUrl: et.scheduling_url,
        }));
    } catch (err) {
      console.error("[calendly] getAvailability error:", err);
      return [];
    }
  }

  /**
   * Devuelve el scheduling_url del event type para que el cliente reserve directamente.
   * El cliente llena su nombre/email en la página de Calendly — no se requieren datos previos.
   */
  async bookSlot(params: {
    startTime: string;
    name?: string;
    email?: string;
    customNote?: string;
  }): Promise<Booking | null> {
    try {
      const et = await this.resolveEventType();
      if (!et) return null;

      const startDate = new Date(params.startTime);

      return {
        inviteeUuid:   "pending",
        eventName:     et.name,
        startTime:     params.startTime,
        endTime:       new Date(startDate.getTime() + et.duration * 60 * 1000).toISOString(),
        status:        "active",
        joinUrl:       et.scheduling_url,
        cancelUrl:     undefined,
        rescheduleUrl: undefined,
      };
    } catch (err) {
      console.error("[calendly] bookSlot error:", err);
      return null;
    }
  }

  async cancelBooking(inviteeUuid: string, reason?: string): Promise<boolean> {
    try {
      await this.apiPost(`/scheduled_events/${inviteeUuid}/cancellation`, {
        reason: reason ?? "Cancelado por el cliente",
      });
      return true;
    } catch (err) {
      console.error("[calendly] cancelBooking error:", err);
      return false;
    }
  }

  async getBooking(inviteeUuid: string): Promise<Booking | null> {
    try {
      const data = await this.apiFetch<{
        resource: {
          uri:        string;
          name:       string;
          start_time: string;
          end_time:   string;
          status:     string;
          location?:  { join_url?: string };
          cancel_url?:     string;
          reschedule_url?: string;
        };
      }>(`/scheduled_events/${inviteeUuid}`);
      const r = data.resource;
      return {
        inviteeUuid,
        eventName:     r.name,
        startTime:     r.start_time,
        endTime:       r.end_time,
        status:        r.status === "canceled" ? "canceled" : "active",
        joinUrl:       r.location?.join_url,
        cancelUrl:     r.cancel_url,
        rescheduleUrl: r.reschedule_url,
      };
    } catch {
      return null;
    }
  }
}
