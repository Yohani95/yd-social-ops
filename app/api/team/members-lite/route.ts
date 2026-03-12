import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { listTeamMembersLite } from "@/lib/team-members";

export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const members = await listTeamMembersLite(ctx.tenantId);
  return NextResponse.json({ success: true, data: members });
}
