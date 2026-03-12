import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function sanitizeNextPath(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

function buildLoginRedirect(request: NextRequest, nextPath: string) {
  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return buildLoginRedirect(request, nextPath);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[Auth Callback] exchangeCodeForSession failed:", error.message);
    return buildLoginRedirect(request, nextPath);
  }

  return NextResponse.redirect(new URL(nextPath, request.nextUrl.origin));
}
