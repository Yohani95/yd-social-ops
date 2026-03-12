import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getInboxThreadById } from "@/lib/inbox";
import { trackEvent } from "@/lib/conversion-analytics";
import type { LeadStage } from "@/types";

const VALID_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "interested",
  "checkout",
  "customer",
  "lost",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    lead_stage?: LeadStage;
    lead_value?: number;
    assigned_tenant_user_id?: string | null;
  };

  if (body.lead_stage && !VALID_STAGES.includes(body.lead_stage)) {
    return NextResponse.json({ error: "lead_stage inválido" }, { status: 400 });
  }

  const thread = await getInboxThreadById({ tenantId: ctx.tenantId, threadId: id });
  if (!thread) return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });

  const now = new Date().toISOString();
  const leadValue = Number.isFinite(body.lead_value) ? Number(body.lead_value) : thread.lead_value_snapshot || 0;
  const stage = body.lead_stage || thread.lead_stage_snapshot || "new";
  const assigned = body.assigned_tenant_user_id ?? thread.assigned_tenant_user_id ?? null;

  const { data: updatedThread, error: threadError } = await ctx.supabase
    .from("conversation_threads")
    .update({
      lead_stage_snapshot: stage,
      lead_value_snapshot: leadValue,
      assigned_tenant_user_id: assigned,
      updated_at: now,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .select("*")
    .single();

  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });

  if (thread.contact_id) {
    const { error: contactError } = await ctx.supabase
      .from("contacts")
      .update({
        lead_stage: stage,
        lead_value: leadValue,
        assigned_tenant_user_id: assigned,
        last_interaction_at: now,
        updated_at: now,
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", thread.contact_id);

    if (contactError) {
      return NextResponse.json({ error: contactError.message }, { status: 500 });
    }
  }

  if (body.lead_stage && body.lead_stage !== thread.lead_stage_snapshot) {
    await trackEvent({
      tenantId: ctx.tenantId,
      eventType: "lead_stage_changed",
      channel: thread.channel,
      contactId: thread.contact_id,
      threadId: thread.id,
      actorType: "human",
      metadata: {
        from_stage: thread.lead_stage_snapshot || "new",
        to_stage: body.lead_stage,
      },
    });
  }

  return NextResponse.json({ success: true, data: updatedThread });
}

