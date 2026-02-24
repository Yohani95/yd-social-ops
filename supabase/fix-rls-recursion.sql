-- ============================================================
-- FIX: Corregir recursión infinita en políticas RLS
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- https://supabase.com/dashboard/project/eqwoxwxzymgtsfybwpjc/sql/new
-- ============================================================

-- 1. tenant_users: eliminar políticas con recursión
DROP POLICY IF EXISTS "tenant_users_select_same_tenant" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_manage_owner" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_select_own" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_insert_owner" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_modify_owner" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_delete_owner" ON tenant_users;

CREATE POLICY "tenant_users_select_own"
  ON tenant_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "tenant_users_insert_owner"
  ON tenant_users FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_users_modify_owner"
  ON tenant_users FOR UPDATE
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_users_delete_owner"
  ON tenant_users FOR DELETE
  USING (tenant_id = get_my_tenant_id());

-- 2. tenants: simplificar usando SECURITY DEFINER
DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
DROP POLICY IF EXISTS "tenants_update_owner" ON tenants;

CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (id = get_my_tenant_id());

CREATE POLICY "tenants_update_owner"
  ON tenants FOR UPDATE
  USING (id = get_my_tenant_id());

-- 3. products: eliminar subqueries a tenant_users
DROP POLICY IF EXISTS "products_update_tenant" ON products;
DROP POLICY IF EXISTS "products_delete_tenant" ON products;

CREATE POLICY "products_update_tenant"
  ON products FOR UPDATE
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "products_delete_tenant"
  ON products FOR DELETE
  USING (tenant_id = get_my_tenant_id());

-- 4. social_channels: eliminar subqueries a tenant_users
DROP POLICY IF EXISTS "social_channels_select_tenant" ON social_channels;
DROP POLICY IF EXISTS "social_channels_manage_owner" ON social_channels;
DROP POLICY IF EXISTS "social_channels_insert_owner" ON social_channels;
DROP POLICY IF EXISTS "social_channels_update_owner" ON social_channels;
DROP POLICY IF EXISTS "social_channels_delete_owner" ON social_channels;

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
