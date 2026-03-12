-- ============================================================
-- PATCH 2026-03-26: Competitive Automation Core
-- Workflow engine + lead lifecycle + campaigns + routing + analytics + integrations
-- ============================================================

-- ------------------------------------------------------------
-- CONTACTS: lead lifecycle fields
-- ------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_stage TEXT CHECK (lead_stage IN ('new', 'contacted', 'qualified', 'interested', 'checkout', 'customer', 'lost')) DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lead_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_stage
  ON contacts(tenant_id, lead_stage, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_assigned
  ON contacts(tenant_id, assigned_tenant_user_id, last_seen_at DESC);

-- ------------------------------------------------------------
-- CONVERSATION THREADS: snapshots for inbox performance
-- ------------------------------------------------------------
ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS lead_stage_snapshot TEXT CHECK (lead_stage_snapshot IN ('new', 'contacted', 'qualified', 'interested', 'checkout', 'customer', 'lost')),
  ADD COLUMN IF NOT EXISTS lead_value_snapshot NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS assigned_tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_threads_tenant_stage_snapshot
  ON conversation_threads(tenant_id, lead_stage_snapshot, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_tenant_assigned
  ON conversation_threads(tenant_id, assigned_tenant_user_id, last_message_at DESC);

-- ------------------------------------------------------------
-- WORKFLOW ENGINE TABLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_workflows (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_type       TEXT NOT NULL CHECK (trigger_type IN ('message_received', 'comment_received', 'lead_stage_changed', 'payment_received', 'scheduled_event')),
  version            INT NOT NULL DEFAULT 1,
  created_by_user_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_nodes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id    UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  node_type      TEXT NOT NULL CHECK (node_type IN ('trigger', 'condition', 'action')),
  sequence_order INT NOT NULL DEFAULT 0,
  label          TEXT NOT NULL,
  config         JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_edges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id    UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES automation_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES automation_nodes(id) ON DELETE CASCADE,
  edge_type      TEXT NOT NULL CHECK (edge_type IN ('success', 'failure', 'true', 'false', 'next', 'timeout')),
  condition_expr JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id      UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  trigger_event_id UUID REFERENCES conversation_events(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  run_context      JSONB NOT NULL DEFAULT '{}',
  execution_log    JSONB NOT NULL DEFAULT '[]',
  error_message    TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  dedupe_key       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_dedupe
  ON automation_runs(tenant_id, workflow_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ------------------------------------------------------------
-- CAMPAIGNS / BROADCAST TABLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  message_template   TEXT NOT NULL,
  filters            JSONB NOT NULL DEFAULT '{}',
  channels           TEXT[] NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')),
  scheduled_at       TIMESTAMPTZ,
  created_by_user_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  provider_message_id TEXT,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id, channel)
);

CREATE TABLE IF NOT EXISTS campaign_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('queued', 'sent', 'delivered', 'read', 'failed', 'clicked', 'replied')),
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ROUTING RULES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routing_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  priority              INT NOT NULL DEFAULT 100,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  condition             JSONB NOT NULL DEFAULT '{}',
  target_team           TEXT NOT NULL,
  target_tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ANALYTICS EVENTS (conversion)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('conversation_started', 'lead_stage_changed', 'payment_link_generated', 'payment_completed', 'campaign_sent', 'campaign_failed', 'workflow_executed')),
  channel     TEXT CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  thread_id   UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  amount      NUMERIC(12, 2),
  currency    TEXT,
  actor_type  TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('bot', 'human', 'system')),
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- INTEGRATION WEBHOOKS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  target_url        TEXT NOT NULL,
  secret            TEXT,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- INDEXES (tenant + created_at and composites)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_automation_workflows_tenant_created
  ON automation_workflows(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_nodes_tenant_created
  ON automation_nodes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_edges_tenant_created
  ON automation_edges(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_tenant_created
  ON automation_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_created
  ON campaigns(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_tenant_created
  ON campaign_contacts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_events_tenant_created
  ON campaign_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_rules_tenant_created
  ON routing_rules(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_created
  ON analytics_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_tenant_created
  ON integration_webhooks(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_tenant_workflow_created
  ON automation_runs(tenant_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_tenant_campaign_status
  ON campaign_contacts(tenant_id, campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_routing_rules_tenant_active_priority
  ON routing_rules(tenant_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_event_created
  ON analytics_events(tenant_id, event_type, created_at DESC);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_workflows_tenant ON automation_workflows;
CREATE POLICY automation_workflows_tenant
  ON automation_workflows FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS automation_nodes_tenant ON automation_nodes;
CREATE POLICY automation_nodes_tenant
  ON automation_nodes FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS automation_edges_tenant ON automation_edges;
CREATE POLICY automation_edges_tenant
  ON automation_edges FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS automation_runs_tenant ON automation_runs;
CREATE POLICY automation_runs_tenant
  ON automation_runs FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS campaigns_tenant ON campaigns;
CREATE POLICY campaigns_tenant
  ON campaigns FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS campaign_contacts_tenant ON campaign_contacts;
CREATE POLICY campaign_contacts_tenant
  ON campaign_contacts FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS campaign_events_tenant ON campaign_events;
CREATE POLICY campaign_events_tenant
  ON campaign_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS routing_rules_tenant ON routing_rules;
CREATE POLICY routing_rules_tenant
  ON routing_rules FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS analytics_events_tenant ON analytics_events;
CREATE POLICY analytics_events_tenant
  ON analytics_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS integration_webhooks_tenant ON integration_webhooks;
CREATE POLICY integration_webhooks_tenant
  ON integration_webhooks FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_automation_workflows_updated_at ON automation_workflows;
CREATE TRIGGER set_automation_workflows_updated_at
  BEFORE UPDATE ON automation_workflows
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_automation_nodes_updated_at ON automation_nodes;
CREATE TRIGGER set_automation_nodes_updated_at
  BEFORE UPDATE ON automation_nodes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_automation_edges_updated_at ON automation_edges;
CREATE TRIGGER set_automation_edges_updated_at
  BEFORE UPDATE ON automation_edges
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_automation_runs_updated_at ON automation_runs;
CREATE TRIGGER set_automation_runs_updated_at
  BEFORE UPDATE ON automation_runs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_campaigns_updated_at ON campaigns;
CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_campaign_contacts_updated_at ON campaign_contacts;
CREATE TRIGGER set_campaign_contacts_updated_at
  BEFORE UPDATE ON campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_routing_rules_updated_at ON routing_rules;
CREATE TRIGGER set_routing_rules_updated_at
  BEFORE UPDATE ON routing_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_integration_webhooks_updated_at ON integration_webhooks;
CREATE TRIGGER set_integration_webhooks_updated_at
  BEFORE UPDATE ON integration_webhooks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ------------------------------------------------------------
-- Backfill snapshots and lead stage defaults
-- ------------------------------------------------------------
UPDATE contacts
SET lead_stage = 'new'
WHERE lead_stage IS NULL;

UPDATE contacts
SET last_interaction_at = COALESCE(last_seen_at, created_at, NOW())
WHERE last_interaction_at IS NULL;

UPDATE conversation_threads t
SET
  lead_stage_snapshot = COALESCE(c.lead_stage, 'new'),
  lead_value_snapshot = COALESCE(c.lead_value, 0),
  assigned_tenant_user_id = COALESCE(t.assigned_tenant_user_id, c.assigned_tenant_user_id)
FROM contacts c
WHERE t.contact_id = c.id
  AND t.tenant_id = c.tenant_id;

-- ------------------------------------------------------------
-- tenant_bot_configs feature flag defaults
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tenant_bot_configs'
      AND column_name = 'feature_flags'
  ) THEN
    ALTER TABLE tenant_bot_configs
      ALTER COLUMN feature_flags
      SET DEFAULT '{
        "workflow_engine_enabled": false,
        "lead_lifecycle_enabled": false,
        "campaigns_enabled": false,
        "routing_enabled": false,
        "conversion_analytics_enabled": false,
        "event_queue_enabled": false,
        "workflow_ui_enabled": false
      }'::jsonb;

    UPDATE tenant_bot_configs
    SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
      || '{
        "workflow_engine_enabled": false,
        "lead_lifecycle_enabled": false,
        "campaigns_enabled": false,
        "routing_enabled": false,
        "conversion_analytics_enabled": false,
        "event_queue_enabled": false,
        "workflow_ui_enabled": false
      }'::jsonb;
  END IF;
END $$;

