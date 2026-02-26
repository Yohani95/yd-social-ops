-- ============================================================
-- PATCH: Add missing columns to tenants used by application code
-- ============================================================

-- 1. Expand plan_tier to include 'business' and 'enterprise_plus'
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_tier_check
  CHECK (plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus'));

-- 2. Add bot_tone column
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bot_tone TEXT DEFAULT 'amigable';

-- Add CHECK constraint only if column just created (safe for re-runs)
DO $$ BEGIN
  ALTER TABLE tenants
    ADD CONSTRAINT tenants_bot_tone_check
    CHECK (bot_tone IN ('formal', 'informal', 'amigable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add business columns
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'products',
  ADD COLUMN IF NOT EXISTS business_description TEXT;

DO $$ BEGIN
  ALTER TABLE tenants
    ADD CONSTRAINT tenants_business_type_check
    CHECK (business_type IN ('products', 'services', 'professional', 'mixed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add contact columns
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_action TEXT DEFAULT 'payment_link',
  ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_custom_message TEXT;

DO $$ BEGIN
  ALTER TABLE tenants
    ADD CONSTRAINT tenants_contact_action_check
    CHECK (contact_action IN ('payment_link', 'whatsapp_contact', 'email_contact', 'custom_message'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
