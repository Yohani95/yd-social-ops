import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getEcommerceAdapter, type EcommerceProduct } from "@/lib/ecommerce";

/**
 * POST /api/cron/ecommerce-sync
 *
 * Sync diario de productos desde todas las tiendas ecommerce activas.
 * Invocado por pg_cron a las 06:00 UTC.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: integrations } = await supabase
    .from("tenant_ecommerce_integrations")
    .select("tenant_id")
    .eq("is_active", true);

  if (!integrations?.length) {
    return NextResponse.json({ success: true, synced: 0 });
  }

  let totalSynced = 0;
  let errors = 0;

  for (const row of integrations) {
    try {
      const adapter = await getEcommerceAdapter(row.tenant_id);
      if (!adapter) continue;

      const products = await adapter.listProducts();
      const count = await syncProducts(row.tenant_id, products);
      totalSynced += count;

      await supabase
        .from("tenant_ecommerce_integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("tenant_id", row.tenant_id);
    } catch (err) {
      console.error(`[cron/ecommerce-sync] tenant ${row.tenant_id} error:`, err);
      errors++;
    }
  }

  return NextResponse.json({ success: true, synced: totalSynced, errors });
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
