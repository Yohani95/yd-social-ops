import { safeDecrypt } from "@/lib/encryption";
import { createServiceClient } from "@/lib/supabase/server";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface EcommerceProduct {
  externalId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number | null;   // null = unlimited / not tracked
  sku: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

export interface EcommerceOrder {
  externalId: string;
  status: string;          // e.g. "pending", "processing", "completed", "cancelled"
  total: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  lineItems: Array<{ name: string; quantity: number; price: number }>;
  createdAt: string;
}

export interface EcommerceAdapter {
  /** Lista todos los productos activos */
  listProducts(): Promise<EcommerceProduct[]>;
  /** Obtiene un producto por su ID externo */
  getProduct(externalId: string): Promise<EcommerceProduct | null>;
  /** Obtiene el estado de un pedido por ID o por email de cliente */
  getOrder(params: { orderId?: string; customerEmail?: string }): Promise<EcommerceOrder | null>;
}

// ── DB Row ───────────────────────────────────────────────────────────────────

interface EcommerceIntegrationRow {
  id: string;
  tenant_id: string;
  platform: "woocommerce" | "shopify";
  shop_url: string;
  api_key: string;      // encrypted
  api_secret: string | null;  // encrypted
  access_token: string | null; // encrypted
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function getEcommerceAdapter(
  tenantId: string
): Promise<EcommerceAdapter | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenant_ecommerce_integrations")
    .select("id, tenant_id, platform, shop_url, api_key, api_secret, access_token")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;

  const row = data as EcommerceIntegrationRow;
  const apiKey      = safeDecrypt(row.api_key) || "";
  const apiSecret   = safeDecrypt(row.api_secret) || "";
  const accessToken = safeDecrypt(row.access_token) || "";

  if (row.platform === "woocommerce") {
    const { WooCommerceAdapter } = await import("./woocommerce");
    return new WooCommerceAdapter(row.shop_url, apiKey, apiSecret);
  }

  if (row.platform === "shopify") {
    const { ShopifyAdapter } = await import("./shopify");
    return new ShopifyAdapter(row.shop_url, accessToken || apiKey);
  }

  return null;
}

export async function getEcommerceIntegration(tenantId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenant_ecommerce_integrations")
    .select("id, platform, shop_url, last_sync_at, is_active, created_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}
