-- ============================================================
-- YD Social Ops - Extend tenant integrations providers (gmail_oauth)
-- Date: 2026-02-26
-- ============================================================

ALTER TABLE tenant_integrations
  DROP CONSTRAINT IF EXISTS tenant_integrations_provider_check;

ALTER TABLE tenant_integrations
  ADD CONSTRAINT tenant_integrations_provider_check
  CHECK (provider IN ('resend', 'n8n', 'smtp', 'gmail_oauth'));
