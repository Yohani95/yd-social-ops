-- ============================================================
-- PATCH 2026-02-28: Dual Mercado Pago + Inbox
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS merchant_checkout_mode TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (merchant_checkout_mode IN ('mp_oauth', 'external_link', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS merchant_external_checkout_url TEXT;

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  mp_preapproval_id  TEXT NOT NULL UNIQUE,
  plan_tier          TEXT NOT NULL
                     CHECK (plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  status             TEXT NOT NULL DEFAULT 'pending',
  payer_email        TEXT,
  external_reference TEXT,
  started_at         TIMESTAMPTZ,
  next_billing_date  TIMESTAMPTZ,
  canceled_at        TIMESTAMPTZ,
  raw_last_payload   JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_billing_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_topic       TEXT NOT NULL,
  event_resource_id TEXT NOT NULL,
  tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_topic, event_resource_id)
);

CREATE TABLE IF NOT EXISTS conversation_threads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  user_identifier TEXT NOT NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unread_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, channel, user_identifier)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id           UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  author_type         TEXT NOT NULL CHECK (author_type IN ('customer', 'bot', 'agent')),
  content             TEXT NOT NULL,
  provider_message_id TEXT,
  raw_payload         JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant ON saas_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON saas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_saas_billing_events_topic_resource ON saas_billing_events(event_topic, event_resource_id);
CREATE INDEX IF NOT EXISTS idx_saas_billing_events_tenant ON saas_billing_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_tenant_status ON conversation_threads(tenant_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_tenant_channel ON conversation_threads(tenant_id, channel, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread_created ON conversation_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_tenant_created ON conversation_messages(tenant_id, created_at DESC);

ALTER TABLE saas_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_subscriptions_tenant ON saas_subscriptions;
CREATE POLICY saas_subscriptions_tenant
  ON saas_subscriptions FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS saas_billing_events_tenant ON saas_billing_events;
CREATE POLICY saas_billing_events_tenant
  ON saas_billing_events FOR SELECT
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS conversation_threads_tenant ON conversation_threads;
CREATE POLICY conversation_threads_tenant
  ON conversation_threads FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS conversation_messages_tenant ON conversation_messages;
CREATE POLICY conversation_messages_tenant
  ON conversation_messages FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_saas_subscriptions_updated_at
  BEFORE UPDATE ON saas_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_saas_billing_events_updated_at
  BEFORE UPDATE ON saas_billing_events
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_conversation_threads_updated_at
  BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
