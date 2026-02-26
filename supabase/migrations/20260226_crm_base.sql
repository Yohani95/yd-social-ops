-- ============================================================
-- YD Social Ops - CRM base + product service fields
-- Date: 2026-02-26
-- ============================================================

-- 1) Product fields for service/business templates
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_label TEXT DEFAULT 'unidad',
  ADD COLUMN IF NOT EXISTS availability_type TEXT DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS min_quantity INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_quantity INT DEFAULT 99;

-- 2) Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  identifier    TEXT NOT NULL,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  tags          TEXT[] DEFAULT '{}',
  notes         TEXT,
  metadata      JSONB DEFAULT '{}',
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel, identifier)
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_identifier ON contacts(tenant_id, identifier);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(tenant_id, last_seen_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_tenant ON contacts;
CREATE POLICY contacts_tenant
  ON contacts FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- 3) Conversation memory table
CREATE TABLE IF NOT EXISTS conversation_memory (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  messages      JSONB NOT NULL DEFAULT '[]',
  context       JSONB NOT NULL DEFAULT '{}',
  expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_session ON conversation_memory(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_memory_expires ON conversation_memory(expires_at);

ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_memory_tenant ON conversation_memory;
CREATE POLICY conversation_memory_tenant
  ON conversation_memory FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS set_contacts_updated_at ON contacts;
CREATE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_conversation_memory_updated_at ON conversation_memory;
CREATE TRIGGER set_conversation_memory_updated_at
  BEFORE UPDATE ON conversation_memory
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
