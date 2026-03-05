-- ============================================================
-- PATCH 2026-03-11: Bot Advanced Config (Fase 2)
-- Configuración granular por tenant/canal y reglas de automatización.
-- Defaults conservadores — no cambia comportamiento existente.
-- ============================================================

-- ============================================================
-- TABLE: tenant_bot_configs
-- Configuración avanzada del bot por tenant.
-- Un registro por tenant; se crea on-demand con defaults.
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_bot_configs (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                     UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  default_tone                  TEXT NOT NULL DEFAULT 'amigable' CHECK (default_tone IN ('formal','informal','amigable')),
  max_response_chars_by_channel JSONB NOT NULL DEFAULT '{}',
  coherence_window_turns        INT  NOT NULL DEFAULT 10 CHECK (coherence_window_turns BETWEEN 1 AND 40),
  repetition_guard_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  fallback_to_human_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.40
                                  CHECK (fallback_confidence_threshold BETWEEN 0.00 AND 1.00),
  sensitive_topics_policy       TEXT NOT NULL DEFAULT 'moderate'
                                  CHECK (sensitive_topics_policy IN ('strict','moderate','relaxed')),
  channel_overrides             JSONB NOT NULL DEFAULT '{}',
  feature_flags                 JSONB NOT NULL DEFAULT '{}',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: channel_automation_rules
-- Reglas de automatización por tenant + canal + tipo de evento.
-- Controla qué acciones puede tomar el bot ante distintos eventos.
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_automation_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('web','whatsapp','messenger','instagram','tiktok')),
  event_type            TEXT NOT NULL CHECK (event_type IN ('dm','comment','mention','story_reply')),
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_actions       TEXT[] NOT NULL DEFAULT ARRAY['auto_reply'],
  confidence_threshold  NUMERIC(3,2) NOT NULL DEFAULT 0.70
                          CHECK (confidence_threshold BETWEEN 0.00 AND 1.00),
  quiet_hours_policy    JSONB,
  safety_policy_ref     TEXT,
  priority              INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, channel, event_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_bot_configs_tenant
  ON tenant_bot_configs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_channel_automation_rules_tenant
  ON channel_automation_rules(tenant_id, channel, event_type);

CREATE INDEX IF NOT EXISTS idx_channel_automation_rules_active
  ON channel_automation_rules(tenant_id, is_active, channel);

-- RLS
ALTER TABLE tenant_bot_configs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bot_configs_tenant ON tenant_bot_configs;
CREATE POLICY tenant_bot_configs_tenant
  ON tenant_bot_configs FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS channel_automation_rules_tenant ON channel_automation_rules;
CREATE POLICY channel_automation_rules_tenant
  ON channel_automation_rules FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Triggers
CREATE OR REPLACE TRIGGER set_tenant_bot_configs_updated_at
  BEFORE UPDATE ON tenant_bot_configs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_channel_automation_rules_updated_at
  BEFORE UPDATE ON channel_automation_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
