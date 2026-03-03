import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { approveMerchantPaymentLink } from "@/lib/merchant-payment-links";

function canApprove(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canApprove(ctx.userRole)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const result = await approveMerchantPaymentLink({
    tenantId: ctx.tenantId,
    linkId: id,
    approvedBy: ctx.userRole === "owner" ? "owner" : "agent",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "No se pudo aprobar el link.",
        error_code: result.code || "approve_failed",
        data: result.link || null,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: result.link });
}
