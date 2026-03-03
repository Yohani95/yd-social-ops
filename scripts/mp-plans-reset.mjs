#!/usr/bin/env node

/**
 * Reset de planes SaaS en Mercado Pago para un app_id/collector determinado.
 *
 * Uso:
 *   node scripts/mp-plans-reset.mjs --app-id=963507112068097 --execute
 *
 * Requiere:
 *   MP_ACCESS_TOKEN en entorno (idealmente TEST para sandbox).
 */

const PLAN_DEFS = [
  { key: "BASIC", name: "Basic", amount: 9990 },
  { key: "PRO", name: "Pro", amount: 24990 },
  { key: "BUSINESS", name: "Business", amount: 49990 },
  { key: "ENTERPRISE", name: "Enterprise", amount: 79990 },
  { key: "ENTERPRISE_PLUS", name: "Enterprise+", amount: 199990 },
];

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function getBackUrl() {
  const base =
    normalizeBaseUrl(process.env.MP_SAAS_BACK_URL_BASE) ||
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) {
    throw new Error("No se pudo resolver base URL para back_url (MP_SAAS_BACK_URL_BASE/APP_URL/NEXT_PUBLIC_APP_URL).");
  }
  return `${base}/dashboard/settings?tab=payments&mp_sub_return=1`;
}

async function mpFetch(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`[${method} ${path}] ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

function printPlanTable(plans) {
  console.log("\nPlanes detectados:");
  if (!plans.length) {
    console.log("- (sin resultados)");
    return;
  }
  for (const plan of plans) {
    console.log(
      `- id=${plan.id} status=${plan.status} subscribed=${plan.subscribed} amount=${plan.auto_recurring?.transaction_amount} app=${plan.application_id || "n/a"} reason="${plan.reason}"`
    );
  }
}

function toEnvBlock(planMap) {
  const basic = planMap.BASIC;
  const pro = planMap.PRO;
  const business = planMap.BUSINESS;
  const enterprise = planMap.ENTERPRISE;
  const enterprisePlus = planMap.ENTERPRISE_PLUS;

  return [
    `MP_PREAPPROVAL_PLAN_BASIC=${basic}`,
    `MP_PREAPPROVAL_PLAN_PRO=${pro}`,
    `MP_PREAPPROVAL_PLAN_BUSINESS=${business}`,
    `MP_PREAPPROVAL_PLAN_ENTERPRISE=${enterprise}`,
    `MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS=${enterprisePlus}`,
    "",
    `MP_PLAN_BASIC_LINK=https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${basic}`,
    `MP_PLAN_PRO_LINK=https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${pro}`,
    `MP_PLAN_BUSINESS_LINK=https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${business}`,
    `MP_PLAN_ENTERPRISE_LINK=https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${enterprise}`,
    `MP_PLAN_ENTERPRISE_PLUS_LINK=https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${enterprisePlus}`,
  ].join("\n");
}

async function main() {
  const token = process.env.MP_ACCESS_TOKEN || getArg("token");
  const appId = getArg("app-id");
  const execute = hasFlag("execute");
  const cancelAll = hasFlag("cancel-all");
  const mode = getArg("mode", "sandbox_local");
  const backUrl = getBackUrl();

  if (!token) {
    throw new Error("Falta MP_ACCESS_TOKEN (o --token=...).");
  }
  if (!appId) {
    throw new Error("Falta --app-id=...");
  }

  const user = await mpFetch("/users/me", { token });
  const collectorId = String(user?.id || "");
  if (!collectorId) {
    throw new Error("No se pudo obtener collector_id desde /users/me.");
  }

  console.log(`Collector: ${collectorId}`);
  console.log(`App ID objetivo: ${appId}`);
  console.log(`Modo: ${mode}`);
  console.log(`Back URL: ${backUrl}`);
  console.log(`Ejecucion real: ${execute ? "SI" : "NO (dry-run)"}`);

  const search = await mpFetch("/preapproval_plan/search?limit=200&sort=date_created&criteria=desc", { token });
  const allPlans = Array.isArray(search?.results) ? search.results : [];

  const scopedPlans = allPlans.filter((plan) => {
    const sameCollector = String(plan.collector_id || "") === collectorId;
    const sameApp = String(plan.application_id || "") === String(appId);
    return sameCollector && sameApp;
  });

  printPlanTable(scopedPlans);

  if (cancelAll) {
    const cancellable = scopedPlans.filter((plan) => Number(plan.subscribed || 0) === 0 && plan.status !== "cancelled");
    console.log(`\nPlanes a cancelar (app=${appId}, subscribed=0): ${cancellable.length}`);
    for (const plan of cancellable) {
      console.log(`- cancelar ${plan.id} (${plan.reason})`);
      if (execute) {
        await mpFetch(`/preapproval_plan/${plan.id}`, {
          token,
          method: "PUT",
          body: { status: "cancelled" },
        });
      }
    }
  }

  const created = {};
  console.log("\nCreando 5 planes canonicos...");
  for (const def of PLAN_DEFS) {
    const payload = {
      reason: `YD Social Ops - ${def.name} (${mode})`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: def.amount,
        currency_id: "CLP",
        free_trial: {
          frequency: 14,
          frequency_type: "days",
        },
      },
      back_url: backUrl,
    };
    console.log(`- ${def.name} (${def.amount} CLP/mes, trial 14d)`);
    if (execute) {
      const plan = await mpFetch("/preapproval_plan", {
        token,
        method: "POST",
        body: payload,
      });
      created[def.key] = String(plan.id);
    }
  }

  if (!execute) {
    console.log("\nDry-run finalizado. Ejecuta de verdad con --execute.");
    return;
  }

  console.log("\nIDs creados:");
  console.log(created);
  console.log("\nBloque .env sugerido:");
  console.log(toEnvBlock(created));
}

main().catch((error) => {
  console.error("\nERROR:", error.message || error);
  process.exitCode = 1;
});

