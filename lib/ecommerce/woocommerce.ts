import type { EcommerceAdapter, EcommerceProduct, EcommerceOrder } from "./index";

/**
 * WooCommerce REST API v3 Adapter
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */
export class WooCommerceAdapter implements EcommerceAdapter {
  private readonly baseUrl: string;
  private readonly auth: string;

  constructor(shopUrl: string, consumerKey: string, consumerSecret: string) {
    // Normalizar URL base
    this.baseUrl = shopUrl.replace(/\/$/, "") + "/wp-json/wc/v3";
    this.auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${this.auth}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`WooCommerce API error ${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  async listProducts(): Promise<EcommerceProduct[]> {
    type WCProduct = {
      id: number; name: string; description: string; short_description: string;
      price: string; regular_price: string; currency: string;
      stock_quantity: number | null; manage_stock: boolean;
      sku: string; images: Array<{ src: string }>; status: string;
    };
    const products = await this.fetch<WCProduct[]>("/products", {
      per_page: "100",
      status: "publish",
    });
    return products.map((p) => ({
      externalId:  String(p.id),
      name:        p.name,
      description: (p.short_description || p.description).replace(/<[^>]+>/g, "").trim(),
      price:       parseFloat(p.price || p.regular_price) || 0,
      currency:    "CLP",
      stock:       p.manage_stock ? (p.stock_quantity ?? 0) : null,
      sku:         p.sku || null,
      imageUrl:    p.images?.[0]?.src || null,
      isActive:    p.status === "publish",
    }));
  }

  async getProduct(externalId: string): Promise<EcommerceProduct | null> {
    try {
      type WCProduct = {
        id: number; name: string; description: string; short_description: string;
        price: string; regular_price: string;
        stock_quantity: number | null; manage_stock: boolean;
        sku: string; images: Array<{ src: string }>; status: string;
      };
      const p = await this.fetch<WCProduct>(`/products/${externalId}`);
      return {
        externalId:  String(p.id),
        name:        p.name,
        description: (p.short_description || p.description).replace(/<[^>]+>/g, "").trim(),
        price:       parseFloat(p.price || p.regular_price) || 0,
        currency:    "CLP",
        stock:       p.manage_stock ? (p.stock_quantity ?? 0) : null,
        sku:         p.sku || null,
        imageUrl:    p.images?.[0]?.src || null,
        isActive:    p.status === "publish",
      };
    } catch {
      return null;
    }
  }

  async getOrder(params: { orderId?: string; customerEmail?: string }): Promise<EcommerceOrder | null> {
    try {
      type WCOrder = {
        id: number; status: string; total: string; currency: string;
        billing: { email: string; first_name: string; last_name: string };
        line_items: Array<{ name: string; quantity: number; total: string }>;
        date_created: string;
      };

      let order: WCOrder;

      if (params.orderId) {
        order = await this.fetch<WCOrder>(`/orders/${params.orderId}`);
      } else if (params.customerEmail) {
        const orders = await this.fetch<WCOrder[]>("/orders", {
          search: params.customerEmail,
          per_page: "1",
        });
        if (!orders.length) return null;
        order = orders[0];
      } else {
        return null;
      }

      return {
        externalId:    String(order.id),
        status:        order.status,
        total:         parseFloat(order.total) || 0,
        currency:      order.currency,
        customerEmail: order.billing?.email || null,
        customerName:  [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" ") || null,
        lineItems:     (order.line_items || []).map((li) => ({
          name:     li.name,
          quantity: li.quantity,
          price:    parseFloat(li.total) || 0,
        })),
        createdAt: order.date_created,
      };
    } catch {
      return null;
    }
  }
}
