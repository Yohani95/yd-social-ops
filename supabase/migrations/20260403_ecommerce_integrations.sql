-- Tabla de integraciones ecommerce por tenant
CREATE TABLE IF NOT EXISTS tenant_ecommerce_integrations (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('woocommerce', 'shopify')),
  shop_url       TEXT NOT NULL,
  api_key        TEXT NOT NULL,   -- AES-256 encrypted
  api_secret     TEXT,            -- AES-256 encrypted (WooCommerce)
  access_token   TEXT,            -- AES-256 encrypted (Shopify OAuth)
  webhook_secret TEXT,
  last_sync_at   TIMESTAMPTZ,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_ecommerce_updated_at
  BEFORE UPDATE ON tenant_ecommerce_integrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE tenant_ecommerce_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_ecommerce_owner" ON tenant_ecommerce_integrations
  USING (tenant_id = get_my_tenant_id());

CREATE INDEX IF NOT EXISTS idx_ecommerce_integrations_tenant
  ON tenant_ecommerce_integrations(tenant_id)
  WHERE is_active = true;

-- Columnas ecommerce en products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ecommerce_product_id TEXT,
  ADD COLUMN IF NOT EXISTS ecommerce_synced_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_ecommerce
  ON products(tenant_id, ecommerce_product_id)
  WHERE ecommerce_product_id IS NOT NULL;
