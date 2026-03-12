-- ============================================================
-- PATCH 2026-03-28: Routing execution evidence
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id               UUID REFERENCES routing_rules(id) ON DELETE SET NULL,
  thread_id             UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel               TEXT CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  target_team           TEXT,
  target_tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
  matched               BOOLEAN NOT NULL DEFAULT TRUE,
  reason                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_events_tenant_rule_created
  ON routing_events(tenant_id, rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_events_tenant_created
  ON routing_events(tenant_id, created_at DESC);

ALTER TABLE routing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routing_events_tenant ON routing_events;
CREATE POLICY routing_events_tenant
  ON routing_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
