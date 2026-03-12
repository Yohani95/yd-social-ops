import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { appendQARun } from "@/lib/qa/history";
import type { QARunSummary, QASuiteResult } from "@/types";

export const runtime = "nodejs";

type SuiteName = "smoke" | "flows" | "bot-scorecard";

const SUITE_COMMAND: Record<SuiteName, string> = {
  smoke: "npm run qa:smoke",
  flows: "npm run qa:flows",
  "bot-scorecard": "npm run qa:bot-scorecard",
};

function runCommand(command: string): Promise<{ ok: boolean; output: string; durationMs: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      env: process.env,
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        output,
        durationMs: Date.now() - started,
      });
    });
  });
}

function outputTail(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-8).join("\n");
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { suites?: SuiteName[] };
  const suites = Array.isArray(body.suites) && body.suites.length > 0
    ? body.suites.filter((suite): suite is SuiteName => suite in SUITE_COMMAND)
    : (["smoke", "flows", "bot-scorecard"] as SuiteName[]);

  const startedAt = new Date().toISOString();
  const suiteResults: QASuiteResult[] = [];

  for (const suite of suites) {
    const run = await runCommand(SUITE_COMMAND[suite]);
    suiteResults.push({
      suite,
      status: run.ok ? "passed" : "failed",
      started_at: new Date(Date.now() - run.durationMs).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: run.durationMs,
      passed: run.ok ? 1 : 0,
      failed: run.ok ? 0 : 1,
      errors: run.ok ? [] : [outputTail(run.output) || "Suite fallida"],
      evidence: [
        {
          command: SUITE_COMMAND[suite],
          output_tail: outputTail(run.output),
        },
      ],
      tests: [
        {
          id: `${suite}-main`,
          name: suite,
          status: run.ok ? "passed" : "failed",
          duration_ms: run.durationMs,
          reason: run.ok ? undefined : "Revisa evidencia para detalle",
        },
      ],
    });
  }

  const hasFailures = suiteResults.some((suite) => suite.status === "failed");
  const finishedAt = new Date().toISOString();
  const summary: QARunSummary = {
    id: randomUUID(),
    tenant_id: ctx.tenantId,
    status: hasFailures ? "failed" : "passed",
    started_at: startedAt,
    finished_at: finishedAt,
    suites: suiteResults,
    meta: {
      requested_suites: suites,
      run_by_user_id: ctx.userId,
      env: process.env.NODE_ENV,
    },
  };

  await appendQARun(summary, ctx.userId);

  return NextResponse.json(
    { success: true, data: summary },
    { status: hasFailures ? 207 : 200 }
  );
}
