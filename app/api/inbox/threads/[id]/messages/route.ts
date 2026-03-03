import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getInboxThreadById, getInboxThreadMessages, markInboxThreadRead } from "@/lib/inbox";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const thread = await getInboxThreadById({ tenantId: ctx.tenantId, threadId: id });

  if (!thread) {
    return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Number(searchParams.get("limit") || "50");
  const before = searchParams.get("before");
  const offsetFromBefore = before ? Number(before) : NaN;
  const offset = Number.isFinite(offsetFromBefore) ? offsetFromBefore : Number(searchParams.get("offset") || "0");

  const result = await getInboxThreadMessages({
    tenantId: ctx.tenantId,
    threadId: id,
    limit,
    offset,
  });

  await markInboxThreadRead({ tenantId: ctx.tenantId, threadId: id });

  return NextResponse.json({
    success: true,
    data: { thread, messages: result.messages },
    pagination: result.pagination,
  });
}
