import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCENARIOS_PATH = path.join(ROOT, "qa", "bot-scorecard", "scenarios.json");
const OUTPUT_PATH = path.join(ROOT, "output", "qa", "bot-scorecard.json");

async function loadEnvFile(filePath) {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function loadLocalEnv() {
  await loadEnvFile(path.join(ROOT, ".env.local"));
  await loadEnvFile(path.join(ROOT, ".env"));
}

function hasDataLeak(text) {
  const leakPatterns = [
    /\bsupabase\b/i,
    /\btenant[_ -]?id\b/i,
    /\bapi\/[a-z0-9/_-]+\b/i,
    /\binternal\b/i,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  ];
  return leakPatterns.some((pattern) => pattern.test(text));
}

function hasClarityNextStep(text) {
  const hints = [
    "te ayudo",
    "te puedo",
    "cuentame",
    "dime",
    "quieres",
    "te comparto",
    "agendar",
    "reserva",
    "siguiente paso",
  ];
  const normalized = text.toLowerCase();
  return hints.some((hint) => normalized.includes(hint)) || normalized.includes("?");
}

function hasPaymentHint(text) {
  return /(pago|link|checkout|mercado pago|cobro)/i.test(text);
}

function hasContactHint(text) {
  return /(whatsapp|correo|email|agendar|agenda|asesor|equipo)/i.test(text);
}

function evaluateScenario(scenario, responseBody) {
  const responseText = String(responseBody?.message || responseBody?.bot_response || "").trim();
  const actualIntent = String(responseBody?.intent_detected || "unknown");

  const reasons = [];
  let score = 0;
  let critical = false;

  const expectedIntent = scenario.expected_intent;
  if (actualIntent === expectedIntent) {
    score += 35;
  } else {
    reasons.push(`Intent esperado ${expectedIntent}, recibido ${actualIntent}`);
  }

  if (responseText.length >= 20 && hasClarityNextStep(responseText)) {
    score += 20;
  } else {
    reasons.push("Respuesta poco clara o sin siguiente paso");
  }

  if (responseText.length > 0 && responseText.length < 700 && responseText !== responseText.toUpperCase()) {
    score += 15;
  } else {
    reasons.push("Tono o formato de respuesta no apropiado");
  }

  if (!hasDataLeak(responseText)) {
    score += 20;
  } else {
    reasons.push("Fuga de datos internos detectada");
    critical = true;
  }

  let flowPass = true;
  if (scenario.requires_payment_hint && !hasPaymentHint(responseText)) {
    flowPass = false;
    reasons.push("Falto sugerencia de pago para escenario de cobro");
  }
  if (scenario.requires_contact_hint && !hasContactHint(responseText)) {
    flowPass = false;
    reasons.push("Falto siguiente paso de contacto/soporte");
  }
  if (flowPass) score += 10;

  if (!responseText) {
    reasons.push("Respuesta vacia");
    critical = true;
  }

  const passed = score >= 70 && !critical;
  return {
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    expected_intent: expectedIntent,
    actual_intent: actualIntent,
    score,
    passed,
    reasons,
    response_preview: responseText.slice(0, 240),
  };
}

async function main() {
  await loadLocalEnv();

  const BASE_URL = process.env.E2E_BASE_URL || process.env.APP_URL || "http://127.0.0.1:3000";
  const TENANT_ID = process.env.E2E_TENANT_ID || "";
  const PASS_THRESHOLD = Number(process.env.BOT_SCORECARD_THRESHOLD || "0.85");

  if (!TENANT_ID) {
    console.error("Falta E2E_TENANT_ID para ejecutar bot scorecard. Define E2E_TENANT_ID en tu entorno o en .env.local.");
    process.exit(1);
  }

  const scenariosRaw = await fs.readFile(SCENARIOS_PATH, "utf-8");
  const scenarios = JSON.parse(scenariosRaw);
  const results = [];

  for (const scenario of scenarios) {
    const response = await fetch(`${BASE_URL}/api/bot/${TENANT_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: scenario.prompt,
        session_id: `qa-scorecard-${Date.now()}-${scenario.id}`,
        user_identifier: `qa-scorecard-${scenario.id}`,
        channel: "web",
      }),
    });

    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    if (!response.ok) {
      results.push({
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        expected_intent: scenario.expected_intent,
        actual_intent: "unknown",
        score: 0,
        passed: false,
        reasons: [`HTTP ${response.status}: ${body?.error || "error"}`],
        response_preview: "",
      });
      continue;
    }

    results.push(evaluateScenario(scenario, body));
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const ratio = results.length > 0 ? passed / results.length : 0;
  const criticalFailures = results.filter((result) =>
    result.reasons.some((reason) => /fuga|vacia/i.test(reason))
  );

  const report = {
    suite: "bot-scorecard",
    status: ratio >= PASS_THRESHOLD && criticalFailures.length === 0 ? "passed" : "failed",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    threshold: PASS_THRESHOLD,
    base_url: BASE_URL,
    tenant_id: TENANT_ID,
    passed,
    failed,
    ratio,
    critical_failures: criticalFailures.length,
    results,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Bot scorecard: ${passed}/${results.length} escenarios aprobados (${Math.round(ratio * 100)}%)`);
  if (report.status !== "passed") {
    console.error("Bot scorecard no cumple umbral de release.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error ejecutando bot scorecard:", error);
  process.exit(1);
});
