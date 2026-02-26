-- ============================================================
-- MCP Servers + API Keys — Fase 4 Enterprise
-- ============================================================

-- Tabla: mcp_servers
-- Servidores MCP que un tenant Enterprise puede conectar
CREATE TABLE IF NOT EXISTS mcp_servers (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  auth_type   TEXT DEFAULT 'none'
    CHECK (auth_type IN ('none', 'bearer', 'api_key', 'basic')),
  auth_secret TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);

-- Tabla: api_keys
-- API keys para acceso programático por tenant
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT 'Default',
  scopes      TEXT[] DEFAULT '{"contacts:read","messages:write"}',
  is_active   BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- RLS
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_servers_tenant" ON mcp_servers FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "api_keys_tenant" ON api_keys FOR ALL
  USING (tenant_id = get_my_tenant_id());

-- Triggers updated_at
CREATE TRIGGER set_mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Agregar columna brand_color a tenants para white-label
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS white_label_primary_color TEXT DEFAULT '#3b82f6';
