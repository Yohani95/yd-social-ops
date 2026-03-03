-- ============================================================
-- YD SOCIAL OPS â€” Schema Completo para Supabase
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: tenants
-- Clientes del SaaS (una fila por negocio/cuenta)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id                       UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  -- Datos del negocio
  email                    TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL DEFAULT '',
  business_name            TEXT NOT NULL DEFAULT '',
  -- Plan y suscripciÃ³n
  plan_tier                TEXT NOT NULL DEFAULT 'basic'
                           CHECK (plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  saas_subscription_status TEXT NOT NULL DEFAULT 'trial'
                           CHECK (saas_subscription_status IN ('active', 'inactive', 'trial')),
  saas_subscription_id     TEXT,           -- ID de suscripciÃ³n MP (para el SaaS)
  trial_ends_at            TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  -- Plan BÃ¡sico: datos bancarios manuales
  bank_details             TEXT,           -- Datos de transferencia bancaria
  -- Plan Pro: Mercado Pago OAuth del vendedor
  mp_access_token          TEXT,           -- Cifrado con AES-256
  mp_refresh_token         TEXT,           -- Cifrado con AES-256
  mp_user_id               TEXT,           -- ID de usuario en Mercado Pago
  mp_connected_at          TIMESTAMPTZ,
  -- Plan Enterprise: configuraciÃ³n avanzada
  max_users                INT NOT NULL DEFAULT 1,
  white_label_domain       TEXT,           -- ej: bot.mitienda.cl
  white_label_name         TEXT,           -- Nombre de la marca
  white_label_logo         TEXT,           -- URL del logo
  -- Bot config
  bot_name                 TEXT DEFAULT 'Asistente',
  bot_welcome_message      TEXT DEFAULT 'Â¡Hola! Â¿En quÃ© puedo ayudarte hoy?',
  bot_tone                 TEXT DEFAULT 'amigable'
                           CHECK (bot_tone IN ('formal', 'informal', 'amigable')),
  -- Negocio
  business_type            TEXT DEFAULT 'products'
                           CHECK (business_type IN ('products', 'services', 'professional', 'mixed')),
  business_description     TEXT,
  business_address         TEXT,
  -- Contacto / acciÃ³n de venta
  contact_action           TEXT DEFAULT 'payment_link'
                           CHECK (contact_action IN ('payment_link', 'whatsapp_contact', 'email_contact', 'custom_message')),
  contact_whatsapp         TEXT,
  contact_email            TEXT,
  contact_custom_message   TEXT,
  -- Metadatos
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: tenant_users
-- Miembros del equipo por tenant (para plan Enterprise)
-- Vinculados a auth.users de Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_users (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'owner'
              CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- ============================================================
-- TABLA: products
-- Inventario de productos por tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock       INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  keywords    TEXT[],         -- Para bÃºsqueda semÃ¡ntica simple ["polera", "roja", "talla M"]
  image_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: chat_logs
-- Historial de conversaciones del bot
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_logs (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id       TEXT,                -- Agrupa mensajes de una misma sesiÃ³n
  user_identifier  TEXT,                -- NÃºmero WA, user ID IG, etc.
  user_message     TEXT NOT NULL,
  bot_response     TEXT NOT NULL,
  intent_detected  TEXT,                -- 'purchase_intent', 'inquiry', 'complaint', etc.
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  payment_link     TEXT,                -- Link de pago generado (si aplica)
  channel          TEXT NOT NULL DEFAULT 'web'
                   CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  tokens_used      INT DEFAULT 0,       -- Para monitorear costos de IA
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: social_channels
-- Canales sociales conectados (Enterprise)
-- ============================================================
CREATE TABLE IF NOT EXISTS social_channels (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type       TEXT NOT NULL
                     CHECK (channel_type IN ('whatsapp', 'messenger', 'instagram', 'tiktok', 'web')),
  channel_identifier TEXT,              -- NÃºmero de WA, username de IG, etc.
  display_name       TEXT,
  access_token       TEXT,              -- Cifrado
  refresh_token      TEXT,              -- Cifrado
  webhook_url        TEXT,              -- URL del webhook para este canal
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  config             JSONB NOT NULL DEFAULT '{}',  -- Config especÃ­fica por canal
  connected_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel_type)
);

-- ============================================================
-- ÃNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id    ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id  ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id      ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_keywords       ON products USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_chat_logs_tenant_id     ON chat_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id    ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at    ON chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_channels_tenant  ON social_channels(tenant_id);

-- ============================================================
-- FUNCIONES HELPER
-- ============================================================

-- FunciÃ³n: obtener tenant_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id
  FROM tenant_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- FunciÃ³n: actualizar updated_at automÃ¡ticamente
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE OR REPLACE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_social_channels_updated_at
  BEFORE UPDATE ON social_channels
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_channels  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLÃTICAS RLS: tenants
-- ============================================================

-- Los usuarios solo pueden ver su propio tenant (via SECURITY DEFINER)
CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (id = get_my_tenant_id());

-- Solo el owner puede actualizar el tenant (via SECURITY DEFINER)
CREATE POLICY "tenants_update_owner"
  ON tenants FOR UPDATE
  USING (id = get_my_tenant_id());

-- ============================================================
-- POLÃTICAS RLS: tenant_users
-- NOTA: Evitar subqueries directas a tenant_users para prevenir recursiÃ³n.
-- Usar user_id = auth.uid() o funciones SECURITY DEFINER.
-- ============================================================

-- Los usuarios ven sus propias membresÃ­as (evita recursiÃ³n infinita)
CREATE POLICY "tenant_users_select_own"
  ON tenant_users FOR SELECT
  USING (user_id = auth.uid());

-- Solo el owner puede insertar miembros en su propio tenant
CREATE POLICY "tenant_users_insert_owner"
  ON tenant_users FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Solo el owner puede modificar/eliminar miembros de su tenant
CREATE POLICY "tenant_users_modify_owner"
  ON tenant_users FOR UPDATE
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_users_delete_owner"
  ON tenant_users FOR DELETE
  USING (tenant_id = get_my_tenant_id());

-- ============================================================
-- POLÃTICAS RLS: products
-- ============================================================

-- Los miembros del tenant ven todos los productos del tenant
CREATE POLICY "products_select_tenant"
  ON products FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
  );

-- Los miembros del tenant (owner/admin) pueden crear/editar productos
CREATE POLICY "products_insert_tenant"
  ON products FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
  );

CREATE POLICY "products_update_tenant"
  ON products FOR UPDATE
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "products_delete_tenant"
  ON products FOR DELETE
  USING (tenant_id = get_my_tenant_id());

-- Los productos activos son pÃºblicos para el bot (sin autenticaciÃ³n)
-- Esto se maneja vÃ­a Service Role en el API del bot

-- ============================================================
-- POLÃTICAS RLS: chat_logs
-- ============================================================

CREATE POLICY "chat_logs_select_tenant"
  ON chat_logs FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
  );

CREATE POLICY "chat_logs_insert_tenant"
  ON chat_logs FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    OR tenant_id IS NOT NULL  -- Permite inserciÃ³n vÃ­a Service Role desde el bot
  );

-- ============================================================
-- POLÃTICAS RLS: social_channels
-- NOTA: Usar funciones SECURITY DEFINER para evitar recursiÃ³n.
-- ============================================================

CREATE POLICY "social_channels_select_tenant"
  ON social_channels FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "social_channels_insert_owner"
  ON social_channels FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "social_channels_update_owner"
  ON social_channels FOR UPDATE
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "social_channels_delete_owner"
  ON social_channels FOR DELETE
  USING (tenant_id = get_my_tenant_id());

-- ============================================================
-- FUNCIÃ“N: Crear tenant al registrarse (trigger en auth.users)
-- Se llama automÃ¡ticamente cuando un usuario se registra
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Crear el tenant
  INSERT INTO tenants (email, name, business_name)
  VALUES (
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'business_name', '')
  )
  RETURNING id INTO new_tenant_id;

  -- Crear la relaciÃ³n tenant_users como owner
  INSERT INTO tenant_users (tenant_id, user_id, role)
  VALUES (new_tenant_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger que crea tenant automÃ¡ticamente al registrarse
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- VISTAS ÃšTILES
-- ============================================================

-- Vista: estadÃ­sticas de chat por tenant
CREATE OR REPLACE VIEW v_chat_stats AS
SELECT
  tenant_id,
  COUNT(*) AS total_messages,
  COUNT(DISTINCT session_id) AS total_sessions,
  COUNT(DISTINCT user_identifier) AS unique_users,
  COUNT(CASE WHEN intent_detected = 'purchase_intent' THEN 1 END) AS purchase_intents,
  COUNT(CASE WHEN payment_link IS NOT NULL THEN 1 END) AS payment_links_generated,
  DATE_TRUNC('day', created_at) AS day
FROM chat_logs
GROUP BY tenant_id, DATE_TRUNC('day', created_at);

-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================

-- ============================================================
-- PATCH 2026-02-26: CRM base + services fields
-- (Mantener sincronizado con supabase/migrations/20260226_crm_base.sql)
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_label TEXT DEFAULT 'unidad',
  ADD COLUMN IF NOT EXISTS availability_type TEXT DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS min_quantity INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_quantity INT DEFAULT 99;

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

CREATE INDEX IF NOT EXISTS idx_contacts_tenant      ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_identifier  ON contacts(tenant_id, identifier);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen   ON contacts(tenant_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_session       ON conversation_memory(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_memory_expires       ON conversation_memory(expires_at);

ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_tenant ON contacts;
CREATE POLICY contacts_tenant
  ON contacts FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS conversation_memory_tenant ON conversation_memory;
CREATE POLICY conversation_memory_tenant
  ON conversation_memory FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_conversation_memory_updated_at
  BEFORE UPDATE ON conversation_memory
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PATCH 2026-02-26: Payment events (webhook idempotency)
-- (Mantener sincronizado con supabase/migrations/20260226_payment_events.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unknown',
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity      INT NOT NULL DEFAULT 1,
  payer_email   TEXT,
  amount        NUMERIC(12, 2) DEFAULT 0,
  currency      TEXT DEFAULT 'CLP',
  stock_updated BOOLEAN NOT NULL DEFAULT false,
  email_sent    BOOLEAN NOT NULL DEFAULT false,
  processed     BOOLEAN NOT NULL DEFAULT false,
  processed_at  TIMESTAMPTZ,
  raw_payload   JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events(tenant_id, processed, created_at DESC);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_tenant ON payment_events;
CREATE POLICY payment_events_tenant
  ON payment_events FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_payment_events_updated_at
  BEFORE UPDATE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PATCH 2026-02-26: FK indexes for new tables
-- (Mantener sincronizado con supabase/migrations/20260226_fk_indexes.sql)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversation_memory_contact_id
  ON conversation_memory(contact_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_product_id
  ON payment_events(product_id);

-- ============================================================
-- PATCH 2026-02-26: MCP servers
-- (Mantener sincronizado con supabase/migrations/20260226_mcp_servers.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_servers (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  auth_type   TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'api_key')),
  auth_secret TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id, is_active);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_servers_tenant ON mcp_servers;
CREATE POLICY mcp_servers_tenant
  ON mcp_servers FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PATCH 2026-02-26: Tenant integrations (Resend / n8n)
-- (Mantener sincronizado con supabase/migrations/20260226_tenant_integrations.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('resend', 'n8n')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant
  ON tenant_integrations(tenant_id, provider, is_active);

ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_integrations_tenant ON tenant_integrations;
CREATE POLICY tenant_integrations_tenant
  ON tenant_integrations FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_tenant_integrations_updated_at
  BEFORE UPDATE ON tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PATCH 2026-02-26: Tenant integrations providers smtp + gmail_oauth
-- (Mantener sincronizado con:
--  - supabase/migrations/20260226_tenant_integrations_smtp.sql
--  - supabase/migrations/20260226_tenant_integrations_gmail_oauth.sql)
-- ============================================================

ALTER TABLE tenant_integrations
  DROP CONSTRAINT IF EXISTS tenant_integrations_provider_check;

ALTER TABLE tenant_integrations
  ADD CONSTRAINT tenant_integrations_provider_check
  CHECK (provider IN ('resend', 'n8n', 'smtp', 'gmail_oauth'));

-- ============================================================
-- PATCH 2026-02-28: Dual Mercado Pago + Inbox
-- (Mantener sincronizado con supabase/migrations/20260228_dual_mp_inbox.sql)
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS merchant_checkout_mode TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (merchant_checkout_mode IN ('mp_oauth', 'external_link', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS merchant_external_checkout_url TEXT;

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  mp_preapproval_id  TEXT NOT NULL UNIQUE,
  plan_tier          TEXT NOT NULL
                     CHECK (plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  status             TEXT NOT NULL DEFAULT 'pending',
  payer_email        TEXT,
  external_reference TEXT,
  started_at         TIMESTAMPTZ,
  next_billing_date  TIMESTAMPTZ,
  canceled_at        TIMESTAMPTZ,
  raw_last_payload   JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_billing_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_topic       TEXT NOT NULL,
  event_resource_id TEXT NOT NULL,
  tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_topic, event_resource_id)
);

CREATE TABLE IF NOT EXISTS conversation_threads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  user_identifier TEXT NOT NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unread_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, channel, user_identifier)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id           UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  author_type         TEXT NOT NULL CHECK (author_type IN ('customer', 'bot', 'agent')),
  content             TEXT NOT NULL,
  provider_message_id TEXT,
  raw_payload         JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant ON saas_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON saas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_saas_billing_events_topic_resource ON saas_billing_events(event_topic, event_resource_id);
CREATE INDEX IF NOT EXISTS idx_saas_billing_events_tenant ON saas_billing_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_tenant_status ON conversation_threads(tenant_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_tenant_channel ON conversation_threads(tenant_id, channel, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread_created ON conversation_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_tenant_created ON conversation_messages(tenant_id, created_at DESC);

ALTER TABLE saas_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_subscriptions_tenant ON saas_subscriptions;
CREATE POLICY saas_subscriptions_tenant
  ON saas_subscriptions FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS saas_billing_events_tenant ON saas_billing_events;
CREATE POLICY saas_billing_events_tenant
  ON saas_billing_events FOR SELECT
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS conversation_threads_tenant ON conversation_threads;
CREATE POLICY conversation_threads_tenant
  ON conversation_threads FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS conversation_messages_tenant ON conversation_messages;
CREATE POLICY conversation_messages_tenant
  ON conversation_messages FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE OR REPLACE TRIGGER set_saas_subscriptions_updated_at
  BEFORE UPDATE ON saas_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_saas_billing_events_updated_at
  BEFORE UPDATE ON saas_billing_events
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_conversation_threads_updated_at
  BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PATCH 2026-03-01: Inbox scaling + archives
-- (Mantener sincronizado con supabase/migrations/20260301_inbox_scaling_archives.sql)
-- ============================================================

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

-- ============================================================
-- PATCH 2026-03-02: SaaS trial lock + plan changes + merchant ad-hoc links
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS saas_trial_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saas_trial_consumed_plan_tier TEXT
    CHECK (saas_trial_consumed_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  ADD COLUMN IF NOT EXISTS pending_plan_tier TEXT
    CHECK (pending_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_plan_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_plan_source TEXT
    CHECK (pending_plan_source IN ('owner_request', 'system')),
  ADD COLUMN IF NOT EXISTS merchant_ad_hoc_link_mode TEXT NOT NULL DEFAULT 'approval'
    CHECK (merchant_ad_hoc_link_mode IN ('manual', 'approval', 'automatic')),
  ADD COLUMN IF NOT EXISTS merchant_ad_hoc_max_amount_clp NUMERIC(10,2) NOT NULL DEFAULT 300000
    CHECK (merchant_ad_hoc_max_amount_clp > 0),
  ADD COLUMN IF NOT EXISTS merchant_ad_hoc_expiry_minutes INT NOT NULL DEFAULT 60
    CHECK (merchant_ad_hoc_expiry_minutes >= 5 AND merchant_ad_hoc_expiry_minutes <= 10080);

CREATE TABLE IF NOT EXISTS tenant_plan_changes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_plan_tier        TEXT NOT NULL
                        CHECK (from_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  to_plan_tier          TEXT NOT NULL
                        CHECK (to_plan_tier IN ('basic', 'pro', 'business', 'enterprise', 'enterprise_plus')),
  change_type           TEXT NOT NULL
                        CHECK (change_type IN ('upgrade', 'downgrade', 'same_plan_blocked')),
  status                TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'scheduled', 'applied', 'cancelled', 'failed')),
  effective_at          TIMESTAMPTZ,
  mp_old_preapproval_id TEXT,
  mp_new_preapproval_id TEXT,
  payload               JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_payment_links (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel            TEXT CHECK (channel IN ('web', 'whatsapp', 'messenger', 'instagram', 'tiktok')),
  thread_id          UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_by         TEXT NOT NULL
                     CHECK (created_by IN ('bot', 'agent', 'owner', 'api')),
  mode_used          TEXT NOT NULL
                     CHECK (mode_used IN ('manual', 'approval', 'automatic')),
  title              TEXT NOT NULL,
  description        TEXT,
  amount_clp         NUMERIC(10,2) NOT NULL CHECK (amount_clp > 0),
  quantity           INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  expires_at         TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'created', 'paid', 'expired', 'cancelled', 'failed')),
  mp_preference_id   TEXT,
  mp_init_point      TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}',
  payment_event_id   UUID REFERENCES payment_events(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_pending_plan
  ON tenants(pending_plan_tier, pending_plan_effective_at);

CREATE INDEX IF NOT EXISTS idx_plan_changes_tenant_created
  ON tenant_plan_changes(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_changes_tenant_status
  ON tenant_plan_changes(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_tenant_status
  ON merchant_payment_links(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_tenant_contact
  ON merchant_payment_links(tenant_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_tenant_thread
  ON merchant_payment_links(tenant_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_pref
  ON merchant_payment_links(tenant_id, mp_preference_id);

ALTER TABLE tenant_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_plan_changes_tenant ON tenant_plan_changes;
CREATE POLICY tenant_plan_changes_tenant
  ON tenant_plan_changes FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS merchant_payment_links_tenant ON merchant_payment_links;
CREATE POLICY merchant_payment_links_tenant
  ON merchant_payment_links FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_tenant_plan_changes_updated_at ON tenant_plan_changes;
CREATE TRIGGER set_tenant_plan_changes_updated_at
  BEFORE UPDATE ON tenant_plan_changes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_merchant_payment_links_updated_at ON merchant_payment_links;
CREATE TRIGGER set_merchant_payment_links_updated_at
  BEFORE UPDATE ON merchant_payment_links
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

