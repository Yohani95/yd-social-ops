export function normalizeBaseUrl(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

export function getAppUrl(fallback = "http://localhost:3000"): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return normalizeBaseUrl(envUrl || fallback);
}
