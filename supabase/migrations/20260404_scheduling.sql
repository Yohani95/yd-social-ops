CREATE TABLE IF NOT EXISTS tenant_scheduling_configs (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  provider        TEXT NOT NULL DEFAULT 'calendly',
  access_token    TEXT NOT NULL,    -- AES-256 encrypted
  event_type_uri  TEXT,             -- URI del tipo de evento default en Calendly
  timezone        TEXT DEFAULT 'America/Santiago',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_scheduling_updated_at
  BEFORE UPDATE ON tenant_scheduling_configs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE tenant_scheduling_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduling_owner" ON tenant_scheduling_configs
  USING (tenant_id = get_my_tenant_id());
