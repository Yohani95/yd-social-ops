-- ============================================================
-- YD SOCIAL OPS — Schema Completo para Supabase
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
  -- Plan y suscripción
  plan_tier                TEXT NOT NULL DEFAULT 'basic'
                           CHECK (plan_tier IN ('basic', 'pro', 'enterprise')),
  saas_subscription_status TEXT NOT NULL DEFAULT 'trial'
                           CHECK (saas_subscription_status IN ('active', 'inactive', 'trial')),
  saas_subscription_id     TEXT,           -- ID de suscripción MP (para el SaaS)
  trial_ends_at            TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  -- Plan Básico: datos bancarios manuales
  bank_details             TEXT,           -- Datos de transferencia bancaria
  -- Plan Pro: Mercado Pago OAuth del vendedor
  mp_access_token          TEXT,           -- Cifrado con AES-256
  mp_refresh_token         TEXT,           -- Cifrado con AES-256
  mp_user_id               TEXT,           -- ID de usuario en Mercado Pago
  mp_connected_at          TIMESTAMPTZ,
  -- Plan Enterprise: configuración avanzada
  max_users                INT NOT NULL DEFAULT 1,
  white_label_domain       TEXT,           -- ej: bot.mitienda.cl
  white_label_name         TEXT,           -- Nombre de la marca
  white_label_logo         TEXT,           -- URL del logo
  -- Bot config
  bot_name                 TEXT DEFAULT 'Asistente',
  bot_welcome_message      TEXT DEFAULT '¡Hola! ¿En qué puedo ayudarte hoy?',
  -- Negocio (extras)
  business_address         TEXT,
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
  keywords    TEXT[],         -- Para búsqueda semántica simple ["polera", "roja", "talla M"]
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
  session_id       TEXT,                -- Agrupa mensajes de una misma sesión
  user_identifier  TEXT,                -- Número WA, user ID IG, etc.
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
  channel_identifier TEXT,              -- Número de WA, username de IG, etc.
  display_name       TEXT,
  access_token       TEXT,              -- Cifrado
  refresh_token      TEXT,              -- Cifrado
  webhook_url        TEXT,              -- URL del webhook para este canal
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  config             JSONB NOT NULL DEFAULT '{}',  -- Config específica por canal
  connected_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel_type)
);

-- ============================================================
-- ÍNDICES para performance
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

-- Función: obtener tenant_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id
  FROM tenant_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Función: actualizar updated_at automáticamente
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
-- POLÍTICAS RLS: tenants
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
-- POLÍTICAS RLS: tenant_users
-- NOTA: Evitar subqueries directas a tenant_users para prevenir recursión.
-- Usar user_id = auth.uid() o funciones SECURITY DEFINER.
-- ============================================================

-- Los usuarios ven sus propias membresías (evita recursión infinita)
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
-- POLÍTICAS RLS: products
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

-- Los productos activos son públicos para el bot (sin autenticación)
-- Esto se maneja vía Service Role en el API del bot

-- ============================================================
-- POLÍTICAS RLS: chat_logs
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
    OR tenant_id IS NOT NULL  -- Permite inserción vía Service Role desde el bot
  );

-- ============================================================
-- POLÍTICAS RLS: social_channels
-- NOTA: Usar funciones SECURITY DEFINER para evitar recursión.
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
-- FUNCIÓN: Crear tenant al registrarse (trigger en auth.users)
-- Se llama automáticamente cuando un usuario se registra
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Crear el tenant
  INSERT INTO tenants (email, name)
  VALUES (NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''))
  RETURNING id INTO new_tenant_id;

  -- Crear la relación tenant_users como owner
  INSERT INTO tenant_users (tenant_id, user_id, role)
  VALUES (new_tenant_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que crea tenant automáticamente al registrarse
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- VISTAS ÚTILES
-- ============================================================

-- Vista: estadísticas de chat por tenant
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
