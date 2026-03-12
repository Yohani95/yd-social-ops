import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { EcommerceProduct } from "@/lib/ecommerce";

/**
 * POST /api/webhooks/ecommerce/:tenant_id
 *
 * Recibe eventos push de WooCommerce o Shopify:
 * - product.created / product.updated → upsert en products
 * - product.deleted               → desactivar producto
 * - order.created / order.updated → reservar stock si corresponde
 *
 * WooCommerce: header X-WC-Webhook-Signature (HMAC-SHA256 base64)
 * Shopify:     header X-Shopify-Hmac-Sha256 (HMAC-SHA256 base64)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  const { tenant_id } = await params;
  const rawBody = await request.text();

  const supabase = createServiceClient();
  const { data: integration } = await supabase
    .from("tenant_ecommerce_integrations")
    .select("platform, webhook_secret")
    .eq("tenant_id", tenant_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // ── Verificar firma ────────────────────────────────────────────────────
  if (integration.webhook_secret) {
    const secret = integration.webhook_secret;

    if (integration.platform === "woocommerce") {
      const sig = request.headers.get("x-wc-webhook-signature") || "";
      const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("base64");
      if (sig !== expected) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    } else if (integration.platform === "shopify") {
      const sig = request.headers.get("x-shopify-hmac-sha256") || "";
      const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("base64");
      if (sig !== expected) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic =
    request.headers.get("x-wc-webhook-topic") ||
    request.headers.get("x-shopify-topic") ||
    "";

  // ── Manejar eventos ────────────────────────────────────────────────────
  if (topic.includes("product")) {
    await handleProductEvent(tenant_id, topic, event, integration.platform);
  } else if (topic.includes("order")) {
    await handleOrderEvent(tenant_id, topic, event);
  }

  return NextResponse.json({ ok: true });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleProductEvent(
  tenantId: string,
  topic: string,
  event: Record<string, unknown>,
  platform: string
) {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  if (topic.includes("deleted")) {
    // Desactivar
    const externalId = String(event.id || "");
    if (externalId) {
      await supabase
        .from("products")
        .update({ is_active: false, updated_at: now })
        .eq("tenant_id", tenantId)
        .eq("ecommerce_product_id", externalId);
    }
    return;
  }

  // created / updated
  const product = normalizeProduct(event, platform);
  if (!product) return;

  await supabase.from("products").upsert(
    {
      tenant_id:            tenantId,
      name:                 product.name,
      description:          product.description,
      price:                product.price,
      currency:             product.currency,
      is_active:            product.isActive,
      sku:                  product.sku,
      ecommerce_product_id: product.externalId,
      ecommerce_synced_at:  now,
      updated_at:           now,
    },
    { onConflict: "tenant_id,ecommerce_product_id" }
  );
}

async function handleOrderEvent(
  tenantId: string,
  topic: string,
  event: Record<string, unknown>
) {
  // Por ahora solo logeamos — la lógica de stock descuento
  // se puede agregar aquí según necesidades del negocio
  console.info(`[ecommerce/webhook] order event ${topic} for tenant ${tenantId}, order ${event.id}`);
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeProduct(
  event: Record<string, unknown>,
  platform: string
): EcommerceProduct | null {
  try {
    if (platform === "woocommerce") {
      return {
        externalId:  String(event.id),
        name:        String(event.name || ""),
        description: String(event.short_description || event.description || "")
          .replace(/<[^>]+>/g, "").trim(),
        price:       parseFloat(String(event.price || event.regular_price || "0")) || 0,
        currency:    "CLP",
        stock:       event.manage_stock ? (Number(event.stock_quantity) ?? 0) : null,
        sku:         String(event.sku || "") || null,
        imageUrl:    ((event.images as Array<{ src: string }> | undefined)?.[0]?.src) || null,
        isActive:    event.status === "publish",
      };
    }
    if (platform === "shopify") {
      const variants = (event.variants as Array<Record<string, unknown>>) || [];
      const variant = variants[0] || {};
      const images = (event.images as Array<{ src: string }>) || [];
      return {
        externalId:  String(event.id),
        name:        String(event.title || ""),
        description: String(event.body_html || "").replace(/<[^>]+>/g, "").trim(),
        price:       parseFloat(String(variant.price || "0")) || 0,
        currency:    "USD",
        stock:       variant.inventory_quantity != null
          ? Number(variant.inventory_quantity)
          : null,
        sku:         String(variant.sku || "") || null,
        imageUrl:    images[0]?.src || null,
        isActive:    event.status === "active",
      };
    }
    return null;
  } catch {
    return null;
  }
}
