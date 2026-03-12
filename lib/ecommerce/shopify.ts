import type { EcommerceAdapter, EcommerceProduct, EcommerceOrder } from "./index";

/**
 * Shopify Admin API Adapter (API version 2024-01)
 * Docs: https://shopify.dev/docs/api/admin-rest
 * Uses Access Token (Private App or Custom App).
 */
export class ShopifyAdapter implements EcommerceAdapter {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(shopUrl: string, accessToken: string) {
    // shopUrl puede ser "mystore.myshopify.com" o "https://mystore.myshopify.com"
    const domain = shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.baseUrl = `https://${domain}/admin/api/2024-01`;
    this.token = accessToken;
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), {
      headers: {
        "X-Shopify-Access-Token": this.token,
        "Content-Type": "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  async listProducts(): Promise<EcommerceProduct[]> {
    type ShopifyProduct = {
      id: number; title: string; body_html: string; status: string;
      variants: Array<{ price: string; inventory_quantity: number; sku: string }>;
      images: Array<{ src: string }>;
    };
    const data = await this.fetch<{ products: ShopifyProduct[] }>("/products.json", {
      status: "active",
      limit: "250",
    });
    return (data.products || []).map((p) => {
      const variant = p.variants?.[0];
      return {
        externalId:  String(p.id),
        name:        p.title,
        description: (p.body_html || "").replace(/<[^>]+>/g, "").trim(),
        price:       parseFloat(variant?.price || "0") || 0,
        currency:    "USD",
        stock:       variant?.inventory_quantity ?? null,
        sku:         variant?.sku || null,
        imageUrl:    p.images?.[0]?.src || null,
        isActive:    p.status === "active",
      };
    });
  }

  async getProduct(externalId: string): Promise<EcommerceProduct | null> {
    try {
      type ShopifyProduct = {
        id: number; title: string; body_html: string; status: string;
        variants: Array<{ price: string; inventory_quantity: number; sku: string }>;
        images: Array<{ src: string }>;
      };
      const data = await this.fetch<{ product: ShopifyProduct }>(`/products/${externalId}.json`);
      const p = data.product;
      const variant = p.variants?.[0];
      return {
        externalId:  String(p.id),
        name:        p.title,
        description: (p.body_html || "").replace(/<[^>]+>/g, "").trim(),
        price:       parseFloat(variant?.price || "0") || 0,
        currency:    "USD",
        stock:       variant?.inventory_quantity ?? null,
        sku:         variant?.sku || null,
        imageUrl:    p.images?.[0]?.src || null,
        isActive:    p.status === "active",
      };
    } catch {
      return null;
    }
  }

  async getOrder(params: { orderId?: string; customerEmail?: string }): Promise<EcommerceOrder | null> {
    try {
      type ShopifyOrder = {
        id: number; financial_status: string; fulfillment_status: string | null;
        total_price: string; currency: string;
        email: string; customer: { first_name: string; last_name: string } | null;
        line_items: Array<{ name: string; quantity: number; price: string }>;
        created_at: string;
      };

      let order: ShopifyOrder;

      if (params.orderId) {
        const data = await this.fetch<{ order: ShopifyOrder }>(`/orders/${params.orderId}.json`);
        order = data.order;
      } else if (params.customerEmail) {
        const data = await this.fetch<{ orders: ShopifyOrder[] }>("/orders.json", {
          email: params.customerEmail,
          limit: "1",
          status: "any",
        });
        if (!data.orders?.length) return null;
        order = data.orders[0];
      } else {
        return null;
      }

      const statusLabel = order.fulfillment_status
        ? `${order.financial_status} / ${order.fulfillment_status}`
        : order.financial_status;

      return {
        externalId:    String(order.id),
        status:        statusLabel,
        total:         parseFloat(order.total_price) || 0,
        currency:      order.currency,
        customerEmail: order.email || null,
        customerName:  order.customer
          ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ")
          : null,
        lineItems: (order.line_items || []).map((li) => ({
          name:     li.name,
          quantity: li.quantity,
          price:    parseFloat(li.price) || 0,
        })),
        createdAt: order.created_at,
      };
    } catch {
      return null;
    }
  }
}
