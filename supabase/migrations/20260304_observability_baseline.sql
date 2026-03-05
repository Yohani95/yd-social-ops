-- ============================================================
-- PATCH 2026-03-04: Observability Baseline (Fase 1)
-- Tablas de trazabilidad y evaluación de calidad conversacional.
-- No modifica comportamiento productivo existente.
-- ============================================================

-- ============================================================
-- TABLE: conversation_events
-- Registro canónico de eventos inbound/outbound por canal y tipo.
-- Centraliza trazabilidad y sirve de base para idempotencia.
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_events (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel                 TEXT NOT NULL CHECK (channel IN ('web','whatsapp','messenger','instagram','tiktok')),
  event_type              TEXT NOT NULL CHECK (event_type IN ('dm','comment','mention','story_reply')),
  event_idempotency_key   TEXT NOT NULL,
  source_message_id       TEXT,
  source_author_id        TEXT NOT NULL,
  content                 TEXT NOT NULL DEFAULT '',
  metadata                JSONB NOT NULL DEFAULT '{}',
  classification          JSONB,
  decision                TEXT CHECK (decision IN ('auto_reply','public_reply','open_dm','handoff_agent','ignore')),
  thread_id               UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  processed               BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, event_idempotency_key)
);

-- ============================================================
-- TABLE: bot_quality_events
-- Evidencias de evaluación de calidad por respuesta del bot.
-- Cada llamada a processMessage genera un registro aquí.
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_quality_events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('web','whatsapp','messenger','instagram','tiktok')),
  event_type            TEXT NOT NULL DEFAULT 'dm' CHECK (event_type IN ('dm','comment','mention','story_reply')),
  conversation_event_id UUID REFERENCES conversation_events(id) ON DELETE SET NULL,
  thread_id             UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  session_id            TEXT,
  user_identifier       TEXT,
  user_message_length   INT NOT NULL DEFAULT 0,
  response_length       INT NOT NULL DEFAULT 0,
  response_latency_ms   INT,
  intent_detected       TEXT CHECK (intent_detected IN ('purchase_intent','inquiry','complaint','greeting','unknown')),
  provider_used         TEXT,
  tokens_used           INT NOT NULL DEFAULT 0,
  is_fallback_response  BOOLEAN NOT NULL DEFAULT FALSE,
  is_repetition         BOOLEAN NOT NULL DEFAULT FALSE,
  coherence_score       NUMERIC(4,3) CHECK (coherence_score IS NULL OR (coherence_score >= 0 AND coherence_score <= 1)),
  evaluator_notes       JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_events_tenant_created
  ON conversation_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_events_tenant_channel
  ON conversation_events(tenant_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_events_idempotency
  ON conversation_events(event_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_bot_quality_events_tenant_created
  ON bot_quality_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_quality_events_tenant_channel
  ON bot_quality_events(tenant_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_quality_events_session
  ON bot_quality_events(tenant_id, session_id, created_at DESC);

-- RLS
ALTER TABLE conversation_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_quality_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_events_tenant ON conversation_events;
CREATE POLICY conversation_events_tenant
  ON conversation_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS bot_quality_events_tenant ON bot_quality_events;
CREATE POLICY bot_quality_events_tenant
  ON bot_quality_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
