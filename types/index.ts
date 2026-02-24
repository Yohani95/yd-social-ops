// ============================================================
// YD Social Ops — Tipos TypeScript del Dominio
// ============================================================

export type PlanTier = "basic" | "pro" | "enterprise";
export type SubscriptionStatus = "active" | "inactive" | "trial";
export type UserRole = "owner" | "admin" | "member";
export type ChatChannel = "web" | "whatsapp" | "messenger" | "instagram" | "tiktok";
export type BusinessType = "products" | "services" | "professional" | "mixed";
export type ContactAction = "payment_link" | "whatsapp_contact" | "email_contact" | "custom_message";
export type BotTone = "formal" | "informal" | "amigable";
export type ItemType = "product" | "service" | "info";
export type IntentType =
  | "purchase_intent"
  | "inquiry"
  | "complaint"
  | "greeting"
  | "unknown";

// ============================================================
// TENANT
// ============================================================

export interface Tenant {
  id: string;
  email: string;
  name: string;
  business_name: string;
  plan_tier: PlanTier;
  saas_subscription_status: SubscriptionStatus;
  saas_subscription_id: string | null;
  trial_ends_at: string | null;
  // Plan Básico
  bank_details: string | null;
  // Plan Pro
  mp_access_token: string | null;
  mp_refresh_token: string | null;
  mp_user_id: string | null;
  mp_connected_at: string | null;
  // Plan Enterprise
  max_users: number;
  white_label_domain: string | null;
  white_label_name: string | null;
  white_label_logo: string | null;
  // Negocio
  business_type: BusinessType;
  business_description: string | null;
  contact_action: ContactAction;
  contact_whatsapp: string | null;
  contact_email: string | null;
  contact_custom_message: string | null;
  // Bot
  bot_name: string;
  bot_welcome_message: string;
  bot_tone: BotTone;
  // Metadatos
  created_at: string;
  updated_at: string;
}

export type TenantUpdate = Partial<
  Pick<
    Tenant,
    | "name"
    | "business_name"
    | "business_type"
    | "business_description"
    | "contact_action"
    | "contact_whatsapp"
    | "contact_email"
    | "contact_custom_message"
    | "bank_details"
    | "bot_name"
    | "bot_welcome_message"
    | "bot_tone"
    | "white_label_name"
    | "white_label_domain"
    | "white_label_logo"
  >
>;

// ============================================================
// TENANT USER
// ============================================================

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

// ============================================================
// PRODUCT
// ============================================================

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  keywords: string[] | null;
  image_url: string | null;
  item_type: ItemType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProductCreate = Pick<
  Product,
  "name" | "description" | "price" | "stock" | "keywords" | "image_url" | "item_type"
>;

export type ProductUpdate = Partial<ProductCreate> & { is_active?: boolean };

// ============================================================
// CHAT LOG
// ============================================================

export interface ChatLog {
  id: string;
  tenant_id: string;
  session_id: string | null;
  user_identifier: string | null;
  user_message: string;
  bot_response: string;
  intent_detected: IntentType | null;
  product_id: string | null;
  payment_link: string | null;
  channel: ChatChannel;
  tokens_used: number;
  created_at: string;
}

// ============================================================
// SOCIAL CHANNEL
// ============================================================

export interface SocialChannel {
  id: string;
  tenant_id: string;
  channel_type: ChatChannel;
  channel_identifier: string | null;
  display_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  webhook_url: string | null;
  is_active: boolean;
  config: Record<string, unknown>;
  provider_config: Record<string, unknown>;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// AI SERVICE
// ============================================================

export interface BotRequest {
  tenant_id: string;
  user_message: string;
  session_id?: string;
  user_identifier?: string;
  channel?: ChatChannel;
}

export interface BotResponse {
  message: string;
  payment_link?: string;
  intent_detected?: IntentType;
  product_id?: string;
}

// ============================================================
// MERCADO PAGO
// ============================================================

export interface MPOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
  public_key: string;
  live_mode: boolean;
}

export interface MPPreferenceItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
}

export interface CreatePreferenceInput {
  tenant_id: string;
  product_id: string;
  quantity?: number;
}

// ============================================================
// PLAN FEATURES
// ============================================================

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PlanInfo {
  id: PlanTier;
  name: string;
  description: string;
  price: number;
  currency: string;
  period: string;
  features: PlanFeature[];
  highlighted?: boolean;
  badge?: string;
}

// ============================================================
// SERVER ACTION RESPONSES
// ============================================================

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================
// DASHBOARD
// ============================================================

export interface DashboardStats {
  total_messages: number;
  total_sessions: number;
  unique_users: number;
  purchase_intents: number;
  payment_links_generated: number;
  active_products: number;
}
