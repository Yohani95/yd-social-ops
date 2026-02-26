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

    await fetch(runtime.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        tenant_id: options?.tenantId || null,
        ...data,
      }),
    });
  } catch (error) {
    console.warn("[n8n] Webhook failed:", error);
  }
}
