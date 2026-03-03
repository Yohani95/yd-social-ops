-- ============================================================
-- PATCH 2026-03-01: Inbox scaling + archives
-- ============================================================

-- Elimina duplicados antiguos de provider_message_id por tenant
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    provider_message_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, provider_message_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM conversation_messages
  WHERE provider_message_id IS NOT NULL
)
DELETE FROM conversation_messages cm
USING ranked r
WHERE cm.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_tenant_provider_message_unique
  ON conversation_messages(tenant_id, provider_message_id);

CREATE TABLE IF NOT EXISTS data_archives (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset    TEXT NOT NULL CHECK (dataset IN ('chat_logs', 'conversation_messages')),
  from_date  TIMESTAMPTZ NOT NULL,
  to_date    TIMESTAMPTZ NOT NULL,
  file_path  TEXT NOT NULL,
  rows_count INT NOT NULL CHECK (rows_count >= 0),
  checksum   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_archives_tenant_dataset_created
  ON data_archives(tenant_id, dataset, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_archives_tenant_range
  ON data_archives(tenant_id, from_date, to_date);

ALTER TABLE data_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_archives_tenant ON data_archives;
CREATE POLICY data_archives_tenant
  ON data_archives FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
