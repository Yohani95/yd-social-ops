-- ============================================================
-- PATCH 2026-03-06: QA Regression Runs
-- ============================================================

CREATE TABLE IF NOT EXISTS qa_runs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'running', 'skipped')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at        TIMESTAMPTZ,
  meta               JSONB NOT NULL DEFAULT '{}',
  created_by_user_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qa_suite_results (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  qa_run_id   UUID NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  suite       TEXT NOT NULL CHECK (suite IN ('smoke', 'flows', 'bot-scorecard')),
  status      TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'running', 'skipped')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  passed      INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  errors      JSONB NOT NULL DEFAULT '[]',
  evidence    JSONB NOT NULL DEFAULT '[]',
  tests       JSONB NOT NULL DEFAULT '[]',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_tenant_created
  ON qa_runs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_suite_results_tenant_created
  ON qa_suite_results(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_suite_results_tenant_run
  ON qa_suite_results(tenant_id, qa_run_id);

ALTER TABLE qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_suite_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qa_runs_tenant ON qa_runs;
CREATE POLICY qa_runs_tenant
  ON qa_runs FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS qa_suite_results_tenant ON qa_suite_results;
CREATE POLICY qa_suite_results_tenant
  ON qa_suite_results FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_qa_runs_updated_at ON qa_runs;
CREATE TRIGGER set_qa_runs_updated_at
  BEFORE UPDATE ON qa_runs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_qa_suite_results_updated_at ON qa_suite_results;
CREATE TRIGGER set_qa_suite_results_updated_at
  BEFORE UPDATE ON qa_suite_results
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
