// ============================================================
// YD Social Ops — Tipos TypeScript del Dominio
// ============================================================

export type PlanTier = "basic" | "pro" | "business" | "enterprise" | "enterprise_plus";
export type SubscriptionStatus = "active" | "inactive" | "trial";
export type UserRole = "owner" | "admin" | "member";
export type ChatChannel = "web" | "whatsapp" | "messenger" | "instagram" | "tiktok";
export type BusinessType = "products" | "services" | "professional" | "mixed";
export type ContactAction = "payment_link" | "whatsapp_contact" | "email_contact" | "custom_message";
export type BotTone = "formal" | "informal" | "amigable";
export type ItemType = "product" | "service" | "info";
export type AvailabilityType = "stock" | "calendar" | "quota";
export type MerchantCheckoutMode = "mp_oauth" | "external_link" | "bank_transfer";
export type MerchantAdHocLinkMode = "manual" | "approval" | "automatic";
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
  saas_trial_consumed_at: string | null;
  saas_trial_consumed_plan_tier: PlanTier | null;
  pending_plan_tier: PlanTier | null;
  pending_plan_effective_at: string | null;
  pending_plan_requested_at: string | null;
  pending_plan_source: "owner_request" | "system" | null;
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
  white_label_primary_color: string | null;
  // Negocio
  business_type: BusinessType;
  business_description: string | null;
  business_address: string | null;
  contact_action: ContactAction;
  contact_whatsapp: string | null;
  contact_email: string | null;
  contact_custom_message: string | null;
  merchant_checkout_mode: MerchantCheckoutMode;
  merchant_external_checkout_url: string | null;
  merchant_ad_hoc_link_mode: MerchantAdHocLinkMode;
  merchant_ad_hoc_max_amount_clp: number;
  merchant_ad_hoc_expiry_minutes: number;
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
    | "business_address"
    | "contact_action"
    | "contact_whatsapp"
    | "contact_email"
    | "contact_custom_message"
    | "merchant_checkout_mode"
    | "merchant_external_checkout_url"
    | "merchant_ad_hoc_link_mode"
    | "merchant_ad_hoc_max_amount_clp"
    | "merchant_ad_hoc_expiry_minutes"
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
  unit_label: string | null;
  availability_type: AvailabilityType | null;
  min_quantity: number | null;
  max_quantity: number | null;
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
> &
  Partial<Pick<Product, "unit_label" | "availability_type" | "min_quantity" | "max_quantity">>;

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

export type ContactIntent = "buying" | "browsing" | "support";

export interface Contact {
  id: string;
  tenant_id: string;
  channel: ChatChannel;
  identifier: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  metadata: Record<string, unknown>;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  /** ID del contacto canónico cuando es el mismo cliente en otro canal (deduplicación). */
  canonical_contact_id?: string | null;
}

export type McpAuthType = "none" | "bearer" | "api_key";
export type IntegrationProvider = "resend" | "n8n" | "smtp" | "gmail_oauth";

export interface McpServer {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  auth_type: McpAuthType;
  auth_secret: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface TenantIntegration {
  id: string;
  tenant_id: string;
  provider: IntegrationProvider;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConversationMemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts: string;
}

export interface ConversationMemory {
  id: string;
  tenant_id: string;
  session_id: string;
  contact_id: string | null;
  messages: ConversationMemoryMessage[];
  context: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface CaptureContactPayload {
  name?: string;
  email?: string;
  phone?: string;
  age?: number;
  username?: string;
  intent?: ContactIntent;
}

export interface PaymentEvent {
  id: string;
  tenant_id: string;
  payment_id: string;
  status: string;
  product_id: string | null;
  quantity: number;
  payer_email: string | null;
  amount: number;
  currency: string;
  stock_updated: boolean;
  email_sent: boolean;
  processed: boolean;
  processed_at: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SaasSubscription {
  id: string;
  tenant_id: string;
  mp_preapproval_id: string;
  plan_tier: PlanTier;
  status: string;
  payer_email: string | null;
  external_reference: string | null;
  started_at: string | null;
  next_billing_date: string | null;
  canceled_at: string | null;
  raw_last_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SaasBillingEvent {
  id: string;
  event_topic: string;
  event_resource_id: string;
  tenant_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PlanChangeType = "upgrade" | "downgrade" | "same_plan_blocked";
export type PlanChangeStatus = "requested" | "scheduled" | "applied" | "cancelled" | "failed";

export interface TenantPlanChange {
  id: string;
  tenant_id: string;
  from_plan_tier: PlanTier;
  to_plan_tier: PlanTier;
  change_type: PlanChangeType;
  status: PlanChangeStatus;
  effective_at: string | null;
  mp_old_preapproval_id: string | null;
  mp_new_preapproval_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type MerchantPaymentLinkStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "created"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export type MerchantPaymentLinkCreatedBy = "bot" | "agent" | "owner" | "api";

export interface MerchantPaymentLink {
  id: string;
  tenant_id: string;
  channel: ChatChannel | null;
  thread_id: string | null;
  contact_id: string | null;
  created_by: MerchantPaymentLinkCreatedBy;
  mode_used: MerchantAdHocLinkMode;
  title: string;
  description: string | null;
  amount_clp: number;
  quantity: number;
  expires_at: string | null;
  status: MerchantPaymentLinkStatus;
  mp_preference_id: string | null;
  mp_init_point: string | null;
  metadata: Record<string, unknown>;
  payment_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ThreadStatus = "open" | "pending" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageAuthorType = "customer" | "bot" | "agent";

export interface ConversationThread {
  id: string;
  tenant_id: string;
  channel: ChatChannel;
  user_identifier: string;
  contact_id: string | null;
  status: ThreadStatus;
  last_message_at: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  thread_id: string;
  tenant_id: string;
  direction: MessageDirection;
  author_type: MessageAuthorType;
  content: string;
  provider_message_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface OffsetPagination {
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface ThreadListResponse {
  data: ConversationThread[];
  pagination: OffsetPagination;
}

export interface ThreadMessagesResponse {
  data: {
    thread: ConversationThread;
    messages: ConversationMessage[];
  };
  pagination: OffsetPagination;
}

export type ArchivedDataset = "chat_logs" | "conversation_messages";

export interface DataArchiveManifest {
  id: string;
  tenant_id: string;
  dataset: ArchivedDataset;
  from_date: string;
  to_date: string;
  file_path: string;
  rows_count: number;
  checksum: string | null;
  created_at: string;
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
