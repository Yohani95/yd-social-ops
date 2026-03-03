import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getMerchantPaymentLink } from "@/lib/merchant-payment-links";

function canManage(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManage(ctx.userRole)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const link = await getMerchantPaymentLink({ tenantId: ctx.tenantId, linkId: id });
  if (!link) {
    return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: link });
}
