import { expect, test } from "@playwright/test";
import { ensureLoggedIn, hasE2ECredentials } from "./helpers/auth";

function stamp(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

test.describe("qa flows", () => {
  test.skip(!hasE2ECredentials(), "Se requieren E2E_EMAIL y E2E_PASSWORD");

  test("workflows CRUD minimo: crear, guardar y probar", async ({ page }) => {
    await ensureLoggedIn(page);

    const workflowName = stamp("QA Workflow");
    const createRes = await page.request.post("/api/workflows", {
      data: {
        name: workflowName,
        description: "Validacion automatica QA",
        trigger_type: "message_received",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as { data?: { id: string } };
    const workflowId = created.data?.id;
    expect(workflowId).toBeTruthy();

    const nodesRes = await page.request.put(`/api/workflows/${workflowId}/nodes`, {
      data: {
        nodes: [
          {
            node_type: "trigger",
            sequence_order: 0,
            label: "Trigger",
            config: { type: "message_received" },
          },
          {
            node_type: "condition",
            sequence_order: 10,
            label: "Intent",
            config: { type: "intent_detected", value: "purchase_intent" },
          },
          {
            node_type: "action",
            sequence_order: 100,
            label: "Mensaje",
            config: { type: "send_message", message: "Te ayudo con la compra, quieres ver opciones?" },
          },
        ],
      },
    });
    expect(nodesRes.ok()).toBeTruthy();

    const testRes = await page.request.post(`/api/workflows/${workflowId}/test`, {
      data: {
        context: {
          triggerType: "message_received",
          channel: "instagram",
          message: "Hola, quiero comprar ahora",
          intentDetected: "purchase_intent",
        },
      },
    });
    expect(testRes.ok()).toBeTruthy();
    const testBody = (await testRes.json()) as { data?: { matched?: boolean } };
    expect(testBody.data?.matched).toBeTruthy();

    const listRes = await page.request.get("/api/workflows");
    expect(listRes.ok()).toBeTruthy();
    const listBody = (await listRes.json()) as {
      data?: Array<{
        id: string;
        health_status?: string;
        runs_24h?: number;
      }>;
    };
    const saved = (listBody.data || []).find((item) => item.id === workflowId);
    expect(saved).toBeTruthy();
    expect(saved?.health_status).toBeTruthy();
    expect(typeof saved?.runs_24h).toBe("number");
  });

  test("campaigns flujo util: crear, programar, ejecutar y validar resumen", async ({ page }) => {
    await ensureLoggedIn(page);

    const campaignName = stamp("QA Campana");
    const createRes = await page.request.post("/api/campaigns", {
      data: {
        name: campaignName,
        message_template: "Hola {{name}}, tenemos una promo activa para ti.",
        channels: ["web", "instagram"],
        filters: { lead_stage: "interested" },
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as { data?: { id: string } };
    const campaignId = created.data?.id;
    expect(campaignId).toBeTruthy();

    const scheduleRes = await page.request.post("/api/campaigns/send", {
      data: {
        campaign_id: campaignId,
        mode: "scheduled",
        scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
    });
    expect(scheduleRes.ok()).toBeTruthy();
    const scheduleBody = (await scheduleRes.json()) as {
      data?: { scheduled?: boolean; summary?: { status?: string; next_action?: string } };
    };
    expect(scheduleBody.data?.scheduled).toBeTruthy();
    expect(scheduleBody.data?.summary?.status).toBe("scheduled");
    expect(scheduleBody.data?.summary?.next_action).toBeTruthy();

    const sendNowRes = await page.request.post("/api/campaigns/send", {
      data: {
        campaign_id: campaignId,
        mode: "now",
        batch_size: 50,
      },
    });
    expect(sendNowRes.ok()).toBeTruthy();
    const sendNowBody = (await sendNowRes.json()) as {
      data?: { processed?: number; summary?: { next_action?: string } };
    };
    expect(sendNowBody.data?.summary?.next_action).toBeTruthy();

    const statsRes = await page.request.get(`/api/campaigns/stats?campaign_id=${campaignId}`);
    expect(statsRes.ok()).toBeTruthy();
    const statsBody = (await statsRes.json()) as {
      data?: {
        queued?: number;
        sent?: number;
        failed?: number;
        skipped?: number;
        summary?: { campaign_id?: string; next_action?: string };
      };
    };
    expect(statsBody.data?.summary?.campaign_id).toBe(campaignId);
    expect(statsBody.data?.summary?.next_action).toBeTruthy();

    await page.goto("/dashboard/campaigns", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: /Campanas/i })).toBeVisible();
    await expect(page.getByText(/Organiza promociones por audiencia/i)).toBeVisible();
  });

  test("routing CRUD minimo: crear regla y verificar resumen", async ({ page }) => {
    await ensureLoggedIn(page);

    const ruleName = stamp("QA Routing");
    const saveRes = await page.request.post("/api/routing/rules", {
      data: {
        name: ruleName,
        priority: 33,
        is_active: true,
        target_team: "ventas",
        target_tenant_user_id: null,
        condition: {
          intents: ["purchase_intent"],
          channels: ["instagram"],
          lead_stages: ["interested"],
          contact_tags: ["cliente_vip"],
        },
      },
    });
    expect(saveRes.ok()).toBeTruthy();

    const listRes = await page.request.get("/api/routing/rules");
    expect(listRes.ok()).toBeTruthy();
    const listJson = (await listRes.json()) as {
      data?: Array<{
        name: string;
        health_status?: string;
        applied_count_24h?: number;
      }>;
    };
    const names = (listJson.data || []).map((item) => item.name);
    expect(names).toContain(ruleName);
    const savedRule = (listJson.data || []).find((item) => item.name === ruleName);
    expect(savedRule?.health_status).toBeTruthy();
    expect(typeof savedRule?.applied_count_24h).toBe("number");
  });

  test("inbox flujo minimo: thread, estado, reply y CRM", async ({ page }) => {
    await ensureLoggedIn(page);

    const tenantId = process.env.E2E_TENANT_ID;
    if (tenantId) {
      await page.request.post(`/api/bot/${tenantId}`, {
        data: {
          message: `Mensaje QA ${Date.now()}`,
          session_id: `qa-session-${Date.now()}`,
          user_identifier: `qa-user-${Date.now()}`,
          channel: "web",
        },
      });
    }

    const threadsRes = await page.request.get("/api/inbox/threads?limit=1&offset=0");
    expect(threadsRes.ok()).toBeTruthy();
    const threadsJson = (await threadsRes.json()) as { data?: Array<{ id: string; status: string }> };
    const thread = threadsJson.data?.[0];

    test.skip(!thread, "No hay threads disponibles para validar inbox");

    const statusRes = await page.request.patch(`/api/inbox/threads/${thread!.id}/status`, {
      data: { status: thread!.status === "open" ? "pending" : "open" },
    });
    expect(statusRes.ok()).toBeTruthy();

    const replyRes = await page.request.post(`/api/inbox/threads/${thread!.id}/reply`, {
      data: { message: `Respuesta QA ${Date.now()}` },
    });
    expect(replyRes.ok()).toBeTruthy();

    const leadRes = await page.request.patch(`/api/inbox/threads/${thread!.id}/lead`, {
      data: {
        lead_stage: "contacted",
        lead_value: 10000,
        assigned_tenant_user_id: null,
      },
    });
    expect(leadRes.ok()).toBeTruthy();
  });
});

