import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { readQARuns } from "@/lib/qa/history";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantRuns = await readQARuns(ctx.tenantId);
  return NextResponse.json({ success: true, data: tenantRuns });
}
