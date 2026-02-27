-- Deduplicación de contactos: vincular el mismo cliente en varios canales (Instagram, Messenger, WhatsApp)
-- Cuando un contacto tiene phone o email que coincide con otro, se vincula mediante canonical_contact_id.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS canonical_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_canonical ON contacts(canonical_contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(tenant_id, phone) WHERE phone IS NOT NULL AND phone != '';
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(tenant_id, email) WHERE email IS NOT NULL AND email != '';
