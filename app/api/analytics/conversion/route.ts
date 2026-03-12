import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { getConversionMetrics } from "@/lib/conversion-analytics";

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const channel = request.nextUrl.searchParams.get("channel");

  const data = await getConversionMetrics({
    tenantId: ctx.tenantId,
    from,
    to,
    channel,
  });

  return NextResponse.json({ success: true, data });
}

