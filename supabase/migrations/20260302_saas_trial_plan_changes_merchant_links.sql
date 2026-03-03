-- ============================================================
-- PATCH 2026-03-02: SaaS trial lock + plan changes + merchant ad-hoc links
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS saas_trial_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saas_trial_consumed_plan_tier TEXT
    CHECK (saas_trial_consumed_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  ADD COLUMN IF NOT EXISTS pending_plan_tier TEXT
    CHECK (pending_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_plan_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_plan_source TEXT
    CHECK (pending_plan_source IN ('owner_request', 'system')),
  ADD COLUMN IF NOT EXISTS merchant_ad_hoc_link_mode TEXT NOT NULL DEFAULT 'approval'
    CHECK (merchant_ad_hoc_link_mode IN ('manual', 'approval', 'automatic')),
  ADD COLUMN IF NOT EXISTS merchant_ad_hoc_max_amount_clp NUMERIC(10,2) NOT NULL DEFAULT 300000
    CHECK (merchant_ad_hoc_max_amount_clp > 0),
  ADD COLUMN IF NOT EXISTS merchant_ad_hoc_expiry_minutes INT NOT NULL DEFAULT 60
    CHECK (merchant_ad_hoc_expiry_minutes >= 5 AND merchant_ad_hoc_expiry_minutes <= 10080);

CREATE TABLE IF NOT EXISTS tenant_plan_changes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_plan_tier        TEXT NOT NULL
                        CHECK (from_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  to_plan_tier          TEXT NOT NULL
                        CHECK (to_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  change_type           TEXT NOT NULL
                        CHECK (change_type IN ('upgrade', 'downgrade', 'same_plan_blocked')),
  status                TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'scheduled', 'applied', 'cancelled', 'failed')),
  effective_at          TIMESTAMPTZ,
  mp_old_preapproval_id TEXT,
  mp_new_preapproval_id TEXT,
  payload               JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_payment_links (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel            TEXT CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  thread_id          UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_by         TEXT NOT NULL
                     CHECK (created_by IN ('bot', 'agent', 'owner', 'api')),
  mode_used          TEXT NOT NULL
                     CHECK (mode_used IN ('manual', 'approval', 'automatic')),
  title              TEXT NOT NULL,
  description        TEXT,
  amount_clp         NUMERIC(10,2) NOT NULL CHECK (amount_clp > 0),
  quantity           INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  expires_at         TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'created', 'paid', 'expired', 'cancelled', 'failed')),
  mp_preference_id   TEXT,
  mp_init_point      TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}',
  payment_event_id   UUID REFERENCES payment_events(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_pending_plan
  ON tenants(pending_plan_tier, pending_plan_effective_at);

CREATE INDEX IF NOT EXISTS idx_plan_changes_tenant_created
  ON tenant_plan_changes(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_changes_tenant_status
  ON tenant_plan_changes(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_tenant_status
  ON merchant_payment_links(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_tenant_contact
  ON merchant_payment_links(tenant_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_tenant_thread
  ON merchant_payment_links(tenant_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_pref
  ON merchant_payment_links(tenant_id, mp_preference_id);

ALTER TABLE tenant_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_plan_changes_tenant ON tenant_plan_changes;
CREATE POLICY tenant_plan_changes_tenant
  ON tenant_plan_changes FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS merchant_payment_links_tenant ON merchant_payment_links;
CREATE POLICY merchant_payment_links_tenant
  ON merchant_payment_links FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_tenant_plan_changes_updated_at ON tenant_plan_changes;
CREATE TRIGGER set_tenant_plan_changes_updated_at
  BEFORE UPDATE ON tenant_plan_changes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_merchant_payment_links_updated_at ON merchant_payment_links;
CREATE TRIGGER set_merchant_payment_links_updated_at
  BEFORE UPDATE ON merchant_payment_links
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

