import { getN8nRuntimeConfig } from "@/lib/tenant-integrations";

export async function notifyN8n(
  event: string,
  data: Record<string, unknown>,
  options?: { tenantId?: string }
): Promise<void> {
  const runtime = await getN8nRuntimeConfig(options?.tenantId);
  if (!runtime.webhookUrl) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (runtime.authHeader) {
      headers.Authorization = runtime.authHeader;
    }

    const timeoutMsRaw = Number(process.env.N8N_WEBHOOK_TIMEOUT_MS ?? 5000);
    const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1000, timeoutMsRaw) : 5000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response | null = null;

    try {
      response = await fetch(runtime.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          tenant_id: options?.tenantId || null,
          ...data,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response && !response.ok) {
      console.warn("[n8n] Webhook responded with status", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.warn("[n8n] Webhook failed:", error);
  }
}
