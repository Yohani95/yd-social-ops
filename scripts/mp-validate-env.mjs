#!/usr/bin/env node

/**
 * Valida coherencia de entorno Mercado Pago para SaaS subscriptions.
 *
 * Uso:
 *   node scripts/mp-validate-env.mjs --env=.env.local
 */

import fs from "node:fs";
import path from "node:path";

const PLAN_KEYS = [
  "MP_PREAPPROVAL_PLAN_BASIC",
  "MP_PREAPPROVAL_PLAN_PRO",
  "MP_PREAPPROVAL_PLAN_BUSINESS",
  "MP_PREAPPROVAL_PLAN_ENTERPRISE",
  "MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS",
];

const LINK_KEYS = [
  "MP_PLAN_BASIC_LINK",
  "MP_PLAN_PRO_LINK",
  "MP_PLAN_BUSINESS_LINK",
  "MP_PLAN_ENTERPRISE_LINK",
  "MP_PLAN_ENTERPRISE_PLUS_LINK",
];

function extractAppIdFromToken(token) {
  if (!token) return null;
  // APP_USR-<app_id>-...
  const appUsr = token.match(/^APP_USR-(\d+)-/);
  if (appUsr?.[1]) return appUsr[1];
  // TEST-<app_id>-...
  const test = token.match(/^TEST-(\d+)-/);
  if (test?.[1]) return test[1];
  return null;
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

async function mpFetch(token, apiPath) {
  const res = await fetch(`https://api.mercadopago.com${apiPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`[GET ${apiPath}] ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

function planIdFromLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("preapproval_plan_id");
  } catch {
    return null;
  }
}

async function main() {
  const envFile = getArg("env", ".env.local");
  const resolved = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No existe archivo de entorno: ${resolved}`);
  }

  const env = parseEnvFile(resolved);
  const token = env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Falta MP_ACCESS_TOKEN en el archivo de entorno.");
  }

  console.log(`\nValidando entorno: ${resolved}`);
  console.log(`Token tipo: ${token.startsWith("TEST-") ? "TEST" : "APP_USR"}`);
  const tokenAppId = extractAppIdFromToken(token);
  if (tokenAppId) {
    console.log(`Token app_id: ${tokenAppId}`);
  }

  const me = await mpFetch(token, "/users/me");
  const callerId = String(me?.id || "");
  if (!callerId) {
    throw new Error("No se pudo resolver caller id desde /users/me.");
  }
  console.log(`Caller user_id: ${callerId}`);

  const rows = [];
  const appIds = new Set();
  let hardFail = false;

  for (const planKey of PLAN_KEYS) {
    const planId = env[planKey];
    if (!planId) {
      rows.push({ key: planKey, planId: "-", collectorId: "-", appId: "-", ok: false, note: "MISSING" });
      hardFail = true;
      continue;
    }

    try {
      const plan = await mpFetch(token, `/preapproval_plan/${planId}`);
      const collectorId = String(plan?.collector_id || "");
      const appId = String(plan?.application_id || "");
      if (appId) appIds.add(appId);
      const ok = collectorId === callerId;
      if (!ok) hardFail = true;
      rows.push({
        key: planKey,
        planId,
        collectorId: collectorId || "-",
        appId: appId || "-",
        ok,
        note: ok ? "OK" : "COLLECTOR_MISMATCH",
      });
    } catch (error) {
      hardFail = true;
      rows.push({
        key: planKey,
        planId,
        collectorId: "-",
        appId: "-",
        ok: false,
        note: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Verifica consistencia de links vs plan vars
  for (let i = 0; i < PLAN_KEYS.length; i += 1) {
    const planKey = PLAN_KEYS[i];
    const linkKey = LINK_KEYS[i];
    const planId = env[planKey];
    const link = env[linkKey];
    if (!link) {
      rows.push({
        key: linkKey,
        planId: "-",
        collectorId: "-",
        appId: "-",
        ok: false,
        note: "MISSING",
      });
      hardFail = true;
      continue;
    }
    const fromLink = planIdFromLink(link);
    const ok = Boolean(fromLink && planId && fromLink === planId);
    if (!ok) hardFail = true;
    rows.push({
      key: linkKey,
      planId: fromLink || "-",
      collectorId: "-",
      appId: "-",
      ok,
      note: ok ? "OK" : `LINK_PLAN_MISMATCH (expected ${planId || "missing_plan_var"})`,
    });
  }

  console.log("\nResultado:");
  for (const row of rows) {
    const status = row.ok ? "OK " : "ERR";
    console.log(
      `[${status}] ${row.key} | plan=${row.planId} | collector=${row.collectorId} | app=${row.appId} | ${row.note}`
    );
  }

  if (appIds.size > 1) {
    hardFail = true;
    console.log(`\n[ERR] Se detectaron multiples application_id en planes: ${Array.from(appIds).join(", ")}`);
  } else if (appIds.size === 1) {
    const detectedAppId = Array.from(appIds)[0];
    console.log(`\nApp de planes detectada: ${detectedAppId}`);
    if (tokenAppId && tokenAppId !== detectedAppId) {
      hardFail = true;
      console.log(
        `[ERR] APP_ID_MISMATCH: token app_id=${tokenAppId} pero planes pertenecen a app_id=${detectedAppId}. ` +
          "El webhook debe configurarse en la app dueña de los planes o debes recrear planes en la app del token."
      );
    }
  }

  if (hardFail) {
    console.log("\nEstado final: FAIL");
    process.exitCode = 1;
    return;
  }

  console.log("\nEstado final: PASS");
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
