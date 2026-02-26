"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import type { ActionResult, ChatLog, Contact } from "@/types";

export async function getContacts(limit = 200): Promise<Contact[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[contacts] getContacts error:", error.message);
    return [];
  }

  return (data as Contact[]) || [];
}

export async function getContactConversation(params: {
  channel: Contact["channel"];
  identifier: string;
  limit?: number;
}): Promise<ChatLog[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const { data, error } = await ctx.supabase
    .from("chat_logs")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("channel", params.channel)
    .eq("user_identifier", params.identifier)
    .order("created_at", { ascending: false })
    .limit(params.limit || 50);

  if (error) {
    console.warn("[contacts] getContactConversation error:", error.message);
    return [];
  }

  return ((data as ChatLog[]) || []).reverse();
}

export async function updateContactNotes(contactId: string, notes: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { error } = await ctx.supabase
    .from("contacts")
    .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

function normalizeTagsFromText(tagsText: string): string[] {
  return Array.from(
    new Set(
      tagsText
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

export async function updateContactTags(contactId: string, tagsText: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const tags = normalizeTagsFromText(tagsText);

  const { error } = await ctx.supabase
    .from("contacts")
    .update({ tags, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

function escapeCsv(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  const escaped = str.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

export async function exportContactsCsv(): Promise<ActionResult<{ csv: string; count: number }>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(5000);

  if (error) return { success: false, error: error.message };

  const rows = (data as Contact[]) || [];
  const header = [
    "id",
    "channel",
    "identifier",
    "name",
    "email",
    "phone",
    "tags",
    "notes",
    "last_seen_at",
    "created_at",
  ].join(",");

  const lines = rows.map((contact) =>
    [
      escapeCsv(contact.id),
      escapeCsv(contact.channel),
      escapeCsv(contact.identifier),
      escapeCsv(contact.name || ""),
      escapeCsv(contact.email || ""),
      escapeCsv(contact.phone || ""),
      escapeCsv((contact.tags || []).join("|")),
      escapeCsv(contact.notes || ""),
      escapeCsv(contact.last_seen_at),
      escapeCsv(contact.created_at),
    ].join(",")
  );

  return {
    success: true,
    data: {
      csv: [header, ...lines].join("\n"),
      count: rows.length,
    },
  };
}
