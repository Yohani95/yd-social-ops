-- Columnas para threading de email en conversation_threads
ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_subject    TEXT;

-- Índice para lookup rápido por Message-ID (deduplicación de replies)
CREATE INDEX IF NOT EXISTS idx_threads_email_msg_id
  ON conversation_threads(tenant_id, email_message_id)
  WHERE channel = 'email';
