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
                   CHECK (channel IN ('web', 'whatsapp', 'instagram', 'tiktok')),
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
                     CHECK (channel_type IN ('whatsapp', 'instagram', 'tiktok', 'web')),
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
