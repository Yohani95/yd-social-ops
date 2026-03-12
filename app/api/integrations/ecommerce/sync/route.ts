import { NextResponse } from "next/server";
import { getAuthenticatedContext, createServiceClient } from "@/lib/supabase/server";
import { getEcommerceAdapter, type EcommerceProduct } from "@/lib/ecommerce";

/**
 * POST /api/integrations/ecommerce/sync
 * Sync manual de productos desde la tienda conectada.
 */
export async function POST() {
  try {
    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const adapter = await getEcommerceAdapter(ctx.tenantId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: "No hay integración ecommerce configurada" },
        { status: 404 }
      );
    }

    const products = await adapter.listProducts();
    const count = await syncProducts(ctx.tenantId, products);

    const supabase = createServiceClient();
    await supabase
      .from("tenant_ecommerce_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId);

    return NextResponse.json({ success: true, data: { products_synced: count } });
  } catch (err) {
    console.error("[ecommerce/sync] error:", err);
    return NextResponse.json({ success: false, error: "Error de sync" }, { status: 500 });
  }
}

async function syncProducts(tenantId: string, products: EcommerceProduct[]): Promise<number> {
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
