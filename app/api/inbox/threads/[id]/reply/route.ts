import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import {
  getActiveChannelConfig,
  getInboxThreadById,
} from "@/lib/inbox";
import { getAdapter } from "@/lib/channel-adapters";
import type { ConversationMessage, ConversationThread } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  const thread = await getInboxThreadById({ tenantId: ctx.tenantId, threadId: id });
  if (!thread) {
    return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
  }

  if (thread.channel !== "web") {
    const channel = await getActiveChannelConfig({
      tenantId: ctx.tenantId,
      channel: thread.channel,
    });

    if (!channel) {
      return NextResponse.json({ error: "Canal inactivo o no configurado" }, { status: 400 });
    }

    const adapter = getAdapter(thread.channel);
    const formattedMessage = adapter.formatMessage(message);
    await adapter.sendReply(thread.user_identifier, formattedMessage, channel, {
      throwOnError: true,
    });
  }

  const now = new Date().toISOString();
  const nextStatus = thread.status === "closed" ? "open" : thread.status;

  const { data: updatedThread, error: threadUpdateError } = await ctx.supabase
    .from("conversation_threads")
    .update({
      status: nextStatus,
      last_message_at: now,
      unread_count: 0,
      updated_at: now,
    })
    .eq("id", thread.id)
    .eq("tenant_id", ctx.tenantId)
    .select("*")
    .single();

  if (threadUpdateError) {
    return NextResponse.json({ error: threadUpdateError.message }, { status: 500 });
  }

  const { data: insertedMessage, error: messageInsertError } = await ctx.supabase
    .from("conversation_messages")
    .insert({
      thread_id: thread.id,
      tenant_id: ctx.tenantId,
      direction: "outbound",
      author_type: "agent",
      content: message,
      provider_message_id: null,
      raw_payload: {
        source: "inbox_manual_reply",
      },
      created_at: now,
    })
    .select("*")
    .single();

  if (messageInsertError) {
    return NextResponse.json({ error: messageInsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      thread: updatedThread as ConversationThread,
      message: insertedMessage as ConversationMessage,
    },
  });
}
