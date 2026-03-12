import { NextRequest } from "next/server";

export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron-auth] CRON_SECRET is not set — denying request by default");
    return false;
  }

  const auth = request.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;

  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret && querySecret === secret) return true;

  return false;
}
