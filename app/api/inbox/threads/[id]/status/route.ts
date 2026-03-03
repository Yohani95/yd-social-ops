import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getInboxThreadById, updateInboxThreadStatus } from "@/lib/inbox";
import type { ThreadStatus } from "@/types";

const VALID_STATUSES: ThreadStatus[] = ["open", "pending", "closed"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: ThreadStatus };
  const status = body.status;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }

  const thread = await getInboxThreadById({ tenantId: ctx.tenantId, threadId: id });
  if (!thread) {
    return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
  }

  const ok = await updateInboxThreadStatus({ tenantId: ctx.tenantId, threadId: id, status });
  if (!ok) {
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
