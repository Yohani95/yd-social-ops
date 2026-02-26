-- ============================================================
-- YD Social Ops - MCP servers per tenant
-- Date: 2026-02-26
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_servers (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  auth_type   TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'api_key')),
  auth_secret TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id, is_active);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_servers_tenant ON mcp_servers;
CREATE POLICY mcp_servers_tenant
  ON mcp_servers FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_mcp_servers_updated_at ON mcp_servers;
CREATE TRIGGER set_mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
