import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_PLANS = new Set([
  "basic",
  "pro",
  "business",
  "enterprise",
  "enterprise_plus",
]);

function normalizePlan(value: string | null): string {
  if (!value) return "basic";
  const raw = value.toLowerCase().trim();
  return VALID_PLANS.has(raw) ? raw : "basic";
}

export async function GET(request: NextRequest) {
  const plan = normalizePlan(request.nextUrl.searchParams.get("plan"));
  const nextPath = `/dashboard/settings?tab=payments&subscribe_plan=${encodeURIComponent(plan)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL(`/login?next=${encodeURIComponent(nextPath)}`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  const dashboardUrl = new URL(nextPath, request.url);
  return NextResponse.redirect(dashboardUrl);
}

