import { createServiceClient } from "@/lib/supabase/server";
import type { QARunSummary, QASuiteResult } from "@/types";

interface QARunRow {
  id: string;
  tenant_id: string;
  status: "passed" | "failed" | "running" | "skipped";
  started_at: string;
  finished_at: string | null;
  meta: Record<string, unknown>;
  qa_suite_results?: QASuiteRow[];
}

interface QASuiteRow {
  suite: "smoke" | "flows" | "bot-scorecard";
  status: "passed" | "failed" | "running" | "skipped";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  passed: number;
  failed: number;
  errors: string[];
  evidence: Array<Record<string, unknown>>;
  tests: QASuiteResult["tests"];
}

export async function readQARuns(tenantId: string): Promise<QARunSummary[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("qa_runs")
    .select("id, tenant_id, status, started_at, finished_at, meta, qa_suite_results(*)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error || !data) {
    console.warn("[QA] readQARuns error:", error?.message);
    return [];
  }

  const rows = data as QARunRow[];
  return rows.map((row) => {
    const suites = (row.qa_suite_results || []).map((suite) => ({
      suite: suite.suite,
      status: suite.status,
      started_at: suite.started_at,
      finished_at: suite.finished_at,
      duration_ms: suite.duration_ms || 0,
      passed: suite.passed || 0,
      failed: suite.failed || 0,
      errors: Array.isArray(suite.errors) ? suite.errors : [],
      evidence: Array.isArray(suite.evidence) ? suite.evidence : [],
      tests: Array.isArray(suite.tests) ? suite.tests : [],
    }));

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      status: row.status,
      started_at: row.started_at,
      finished_at: row.finished_at || row.started_at,
      suites,
      meta: (row.meta || {}) as Record<string, unknown>,
    } satisfies QARunSummary;
  });
}

export async function appendQARun(run: QARunSummary, createdByUserId: string): Promise<void> {
  const supabase = createServiceClient();
  const runInsert = await supabase
    .from("qa_runs")
    .insert({
      id: run.id,
      tenant_id: run.tenant_id,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      meta: run.meta,
      created_by_user_id: createdByUserId,
    })
    .select("id")
    .single();

  if (runInsert.error) {
    console.warn("[QA] appendQARun insert run error:", runInsert.error.message);
    return;
  }

  if (run.suites.length === 0) return;

  const suitesRows = run.suites.map((suite) => ({
    tenant_id: run.tenant_id,
    qa_run_id: run.id,
    suite: suite.suite,
    status: suite.status,
    duration_ms: suite.duration_ms || 0,
    passed: suite.passed || 0,
    failed: suite.failed || 0,
    errors: suite.errors || [],
    evidence: suite.evidence || [],
    tests: suite.tests || [],
    started_at: suite.started_at,
    finished_at: suite.finished_at,
  }));

  const suitesInsert = await supabase.from("qa_suite_results").insert(suitesRows);
  if (suitesInsert.error) {
    console.warn("[QA] appendQARun insert suites error:", suitesInsert.error.message);
  }
}
