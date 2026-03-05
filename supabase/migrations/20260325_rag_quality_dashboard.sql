-- ============================================================
-- PATCH 2026-03-25: RAG + Quality Dashboard (Fase 4)
-- bot_knowledge_chunks para RAG léxico.
-- View v_quality_metrics para métricas agregadas.
-- ============================================================

-- ============================================================
-- TABLE: bot_knowledge_chunks
-- Bloques de conocimiento versionados por tenant/canal/fuente.
-- Usados para RAG léxico en buildSystemPrompt.
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_knowledge_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL DEFAULT 'all',
  source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('products','faq','chat_logs','manual')),
  topic       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  version     INT NOT NULL DEFAULT 1,
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 1.00
                CHECK (confidence BETWEEN 0.00 AND 1.00),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_knowledge_chunks_tenant_active
  ON bot_knowledge_chunks(tenant_id, is_active, source, topic);

CREATE INDEX IF NOT EXISTS idx_bot_knowledge_chunks_tenant_channel
  ON bot_knowledge_chunks(tenant_id, channel, is_active);

ALTER TABLE bot_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_knowledge_chunks_tenant ON bot_knowledge_chunks;
CREATE POLICY bot_knowledge_chunks_tenant
  ON bot_knowledge_chunks FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_bot_knowledge_chunks_updated_at
  BEFORE UPDATE ON bot_knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- VIEW: v_quality_metrics
-- Agrega bot_quality_events por tenant + canal + semana ISO.
-- ============================================================
CREATE OR REPLACE VIEW v_quality_metrics AS
SELECT
  tenant_id,
  channel,
  DATE_TRUNC('week', created_at)                                    AS week_start,
  COUNT(*)                                                           AS total_responses,
  AVG(response_latency_ms)                                          AS avg_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_latency_ms) AS p95_latency_ms,
  ROUND(
    SUM(CASE WHEN is_repetition THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0), 4
  )                                                                  AS repetition_rate,
  ROUND(
    SUM(CASE WHEN is_fallback_response THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0), 4
  )                                                                  AS fallback_rate,
  AVG(coherence_score)                                              AS avg_coherence_score
FROM bot_quality_events
WHERE response_latency_ms IS NOT NULL
GROUP BY tenant_id, channel, DATE_TRUNC('week', created_at);
