-- ============================================================
-- PATCH 2026-03-27: Catalog flexibility + campaign operations
-- ============================================================

-- ------------------------------------------------------------
-- TENANTS: catalog profile by business maturity
-- ------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS catalog_profile TEXT;

UPDATE tenants
SET catalog_profile = 'generic'
WHERE catalog_profile IS NULL;

ALTER TABLE tenants
  ALTER COLUMN catalog_profile SET DEFAULT 'generic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_catalog_profile_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_catalog_profile_check
      CHECK (catalog_profile IN ('generic', 'restaurant', 'dental', 'lodging', 'support', 'delivery'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- PRODUCTS: adaptive catalog fields
-- ------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS item_type TEXT,
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT,
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE products
SET item_type = COALESCE(item_type, 'product')
WHERE item_type IS NULL;

UPDATE products
SET pricing_mode = CASE
  WHEN item_type = 'info' THEN 'free'
  WHEN item_type = 'service' THEN 'from'
  WHEN item_type = 'delivery' THEN 'fixed'
  ELSE 'fixed'
END
WHERE pricing_mode IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_item_type_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_item_type_check
      CHECK (item_type IN ('product', 'service', 'info', 'delivery'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_pricing_mode_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_pricing_mode_check
      CHECK (pricing_mode IN ('fixed', 'from', 'quote', 'free'));
  END IF;
END $$;

ALTER TABLE products
  ALTER COLUMN item_type SET DEFAULT 'product';

ALTER TABLE products
  ALTER COLUMN pricing_mode SET DEFAULT 'fixed';

-- ------------------------------------------------------------
-- CAMPAIGNS: operational execution metadata
-- ------------------------------------------------------------
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS run_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaigns_run_status_check'
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_run_status_check
      CHECK (run_status IN ('idle', 'queued', 'running', 'completed', 'failed'));
  END IF;
END $$;

UPDATE campaigns
SET
  run_status = CASE
    WHEN status = 'scheduled' THEN 'queued'
    WHEN status = 'running' THEN 'running'
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'cancelled' THEN 'failed'
    ELSE 'idle'
  END,
  next_run_at = CASE
    WHEN status = 'scheduled' THEN scheduled_at
    ELSE next_run_at
  END
WHERE run_status IS NULL
   OR next_run_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status_next_run
  ON campaigns(tenant_id, status, run_status, next_run_at);
