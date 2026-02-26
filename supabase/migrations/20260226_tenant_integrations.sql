-- ============================================================
-- YD Social Ops - Tenant integrations (per-tenant config)
-- Date: 2026-02-26
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('resend', 'n8n')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant
  ON tenant_integrations(tenant_id, provider, is_active);

ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_integrations_tenant ON tenant_integrations;
CREATE POLICY tenant_integrations_tenant
  ON tenant_integrations FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_tenant_integrations_updated_at ON tenant_integrations;
CREATE TRIGGER set_tenant_integrations_updated_at
  BEFORE UPDATE ON tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

