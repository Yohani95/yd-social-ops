-- ============================================================
-- YD Social Ops - payment webhook idempotency/events
-- Date: 2026-02-26
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unknown',
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity      INT NOT NULL DEFAULT 1,
  payer_email   TEXT,
  amount        NUMERIC(12, 2) DEFAULT 0,
  currency      TEXT DEFAULT 'CLP',
  stock_updated BOOLEAN NOT NULL DEFAULT false,
  email_sent    BOOLEAN NOT NULL DEFAULT false,
  processed     BOOLEAN NOT NULL DEFAULT false,
  processed_at  TIMESTAMPTZ,
  raw_payload   JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events(tenant_id, processed, created_at DESC);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_tenant ON payment_events;
CREATE POLICY payment_events_tenant
  ON payment_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_payment_events_updated_at ON payment_events;
CREATE TRIGGER set_payment_events_updated_at
  BEFORE UPDATE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
