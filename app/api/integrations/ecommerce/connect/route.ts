import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { getEcommerceAdapter, type EcommerceProduct } from "@/lib/ecommerce";

/**
 * POST /api/integrations/ecommerce/connect
 *
 * Conecta una tienda WooCommerce o Shopify al tenant.
 * Guarda credenciales cifradas + hace el primer sync de productos.
 *
 * Body:
 * {
 *   platform: "woocommerce" | "shopify",
 *   shop_url: string,
 *   api_key: string,          // WC consumer key / Shopify access token
 *   api_secret?: string,      // WC consumer secret
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { platform, shop_url, api_key, api_secret } = body;

    if (!platform || !shop_url || !api_key) {
      return NextResponse.json(
        { success: false, error: "platform, shop_url y api_key son requeridos" },
        { status: 400 }
      );
    }

    if (!["woocommerce", "shopify"].includes(platform)) {
      return NextResponse.json(
        { success: false, error: "platform debe ser 'woocommerce' o 'shopify'" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Upsert integration
    const { data: integration, error } = await supabase
      .from("tenant_ecommerce_integrations")
      .upsert(
        {
          tenant_id:   ctx.tenantId,
          platform,
          shop_url:    shop_url.replace(/\/$/, ""),
          api_key:     encrypt(api_key),
          api_secret:  api_secret ? encrypt(api_secret) : null,
          is_active:   true,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      )
      .select("id")
      .single();

    if (error) {
      console.error("[ecommerce/connect] upsert error:", error);
      return NextResponse.json(
        { success: false, error: "Error guardando integración" },
        { status: 500 }
      );
    }

    // Probar conexión y hacer primer sync
    const adapter = await getEcommerceAdapter(ctx.tenantId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: "No se pudo inicializar el adapter" },
        { status: 500 }
      );
    }

    let syncedCount = 0;
    try {
      const products = await adapter.listProducts();
      syncedCount = await syncProducts(ctx.tenantId, products);

      await supabase
        .from("tenant_ecommerce_integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", integration.id);
    } catch (syncErr) {
      console.error("[ecommerce/connect] sync error:", syncErr);
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas o tienda no accesible" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { integration_id: integration.id, products_synced: syncedCount },
    });
  } catch (err) {
    console.error("[ecommerce/connect] error:", err);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// ── GET: obtener integración activa ──────────────────────────────────────────

export async function GET() {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("tenant_ecommerce_integrations")
      .select("id, platform, shop_url, last_sync_at, is_active, created_at")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    return NextResponse.json({ success: true, data: data || null });
  } catch (err) {
    console.error("[ecommerce/connect] GET error:", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function syncProducts(
  tenantId: string,
  products: EcommerceProduct[]
): Promise<number> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  let count = 0;

  for (const p of products) {
    const { error } = await supabase.from("products").upsert(
      {
        tenant_id:            tenantId,
        name:                 p.name,
        description:          p.description,
        price:                p.price,
        currency:             p.currency,
        is_active:            p.isActive,
        sku:                  p.sku,
        ecommerce_product_id: p.externalId,
        ecommerce_synced_at:  now,
        updated_at:           now,
      },
      { onConflict: "tenant_id,ecommerce_product_id" }
    );
    if (!error) count++;
  }

  return count;
}
