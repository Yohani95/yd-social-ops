#!/usr/bin/env node

/**
 * Actualiza back_url de los 5 preapproval plans configurados en .env.
 *
 * Uso:
 *   node scripts/mp-update-plan-backurls.mjs --base=https://<ngrok>
 */

import fs from "node:fs";

const PLAN_KEYS = [
  { env: "MP_PREAPPROVAL_PLAN_BASIC", slug: "basic" },
  { env: "MP_PREAPPROVAL_PLAN_PRO", slug: "pro" },
  { env: "MP_PREAPPROVAL_PLAN_BUSINESS", slug: "business" },
  { env: "MP_PREAPPROVAL_PLAN_ENTERPRISE", slug: "enterprise" },
  { env: "MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS", slug: "enterprise_plus" },
];

function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    const out = {};
    for (const lineRaw of raw.split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
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

async function main() {
  const envFile = getArg("env", ".env.local");
  const localEnv = await readEnvFile(envFile);
  const token = process.env.MP_ACCESS_TOKEN || localEnv.MP_ACCESS_TOKEN;
  const baseUrl =
    normalizeBaseUrl(getArg("base")) ||
    normalizeBaseUrl(process.env.MP_SAAS_BACK_URL_BASE || localEnv.MP_SAAS_BACK_URL_BASE) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL || localEnv.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.APP_URL || localEnv.APP_URL);

  if (!token) {
    throw new Error("Falta MP_ACCESS_TOKEN en entorno.");
  }
  if (!baseUrl) {
    throw new Error("Falta base URL valida (--base o MP_SAAS_BACK_URL_BASE).");
  }

  console.log(`Base URL usada: ${baseUrl}`);

  for (const item of PLAN_KEYS) {
    const id = process.env[item.env] || localEnv[item.env];
    if (!id) {
      console.log(`SKIP ${item.env}: no configurado`);
      continue;
    }

    const backUrl = `${baseUrl}/dashboard/settings?tab=payments&subscribe_plan=${item.slug}&mp_sub_return=1`;
    const updated = await mpFetch(`/preapproval_plan/${id}`, {
      token,
      method: "PUT",
      body: { back_url: backUrl },
    });

    console.log(`OK ${item.env} (${id}) -> ${updated.back_url}`);
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
