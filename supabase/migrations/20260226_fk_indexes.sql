-- ============================================================
-- YD Social Ops - FK indexes for new tables
-- Date: 2026-02-26
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversation_memory_contact_id
  ON conversation_memory(contact_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_product_id
  ON payment_events(product_id);
