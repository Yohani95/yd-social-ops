import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { rejectMerchantPaymentLink } from "@/lib/merchant-payment-links";

function canReject(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canReject(ctx.userRole)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const { id } = await params;

  const result = await rejectMerchantPaymentLink({
    tenantId: ctx.tenantId,
    linkId: id,
    rejectedBy: ctx.userRole === "owner" ? "owner" : "agent",
    reason: body.reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "No se pudo rechazar el link.",
        error_code: result.code || "reject_failed",
        data: result.link || null,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: result.link });
}
