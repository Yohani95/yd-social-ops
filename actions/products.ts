"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  ActionResult,
  AvailabilityType,
  ItemType,
  PricingMode,
  Product,
  ProductCreate,
  ProductUpdate,
} from "@/types";

const MAX_BULK_IMPORT = 500;

function normalizeItemType(input: unknown): ItemType {
  const value = String(input || "").trim().toLowerCase();
  if (value === "service" || value === "info" || value === "delivery") return value;
  return "product";
}

function normalizeAvailabilityType(input: unknown, itemType: ItemType): AvailabilityType {
  const value = String(input || "").trim().toLowerCase();
  if (value === "calendar" || value === "quota" || value === "stock") return value;

  if (itemType === "service") return "calendar";
  if (itemType === "delivery") return "quota";
  return "stock";
}

function normalizePricingMode(input: unknown, itemType: ItemType): PricingMode {
  const value = String(input || "").trim().toLowerCase();
  if (value === "fixed" || value === "from" || value === "quote" || value === "free") return value;

  if (itemType === "info") return "free";
  if (itemType === "service") return "from";
  return "fixed";
}

function defaultUnitLabel(itemType: ItemType): string {
  if (itemType === "service") return "cupo";
  if (itemType === "delivery") return "pedido";
  if (itemType === "info") return "info";
  return "unidad";
}

function normalizeAttributes(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function normalizeProductForInsert(product: ProductCreate): {
  name: string;
  description: string | null;
  price: number;
  stock: number;
  unit_label: string;
  availability_type: AvailabilityType;
  min_quantity: number;
  max_quantity: number;
  keywords: string[] | null;
  image_url: string | null;
  item_type: ItemType;
  pricing_mode: PricingMode;
  attributes: Record<string, unknown>;
} {
  const itemType = normalizeItemType(product.item_type);
  const pricingMode = normalizePricingMode(product.pricing_mode, itemType);
  const availabilityType = normalizeAvailabilityType(product.availability_type, itemType);

  const price = Number.isFinite(Number(product.price)) ? Math.max(0, Number(product.price)) : 0;
  const stock = Number.isFinite(Number(product.stock)) ? Math.max(0, Math.round(Number(product.stock))) : 0;

  const normalizedPrice = itemType === "info" || pricingMode === "free" ? 0 : price;
  const normalizedStock = itemType === "info" ? 0 : stock;

  return {
    name: String(product.name || "").trim(),
    description: product.description?.trim() || null,
    price: normalizedPrice,
    stock: normalizedStock,
    unit_label: product.unit_label?.trim() || defaultUnitLabel(itemType),
    availability_type: availabilityType,
    min_quantity: Number.isFinite(Number(product.min_quantity))
      ? Math.max(1, Math.round(Number(product.min_quantity)))
      : 1,
    max_quantity: Number.isFinite(Number(product.max_quantity))
      ? Math.max(1, Math.round(Number(product.max_quantity)))
      : itemType === "service" && availabilityType === "calendar"
        ? 30
        : 99,
    keywords: Array.isArray(product.keywords)
      ? product.keywords
          .map((k) => String(k).trim())
          .filter(Boolean)
          .slice(0, 20)
      : null,
    image_url: product.image_url?.trim() || null,
    item_type: itemType,
    pricing_mode: pricingMode,
    attributes: normalizeAttributes(product.attributes),
  };
}

export async function getProducts(): Promise<Product[]> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return [];

  const { data, error } = await ctx.supabase
    .from("products")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data as Product[];
}

export async function createProduct(product: ProductCreate): Promise<ActionResult<Product>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const payload = normalizeProductForInsert(product);
  if (!payload.name) {
    return { success: false, error: "El nombre del item es requerido" };
  }
  if (payload.price < 0) {
    return { success: false, error: "El precio no puede ser negativo" };
  }

  const { data, error } = await ctx.supabase
    .from("products")
    .insert({
      tenant_id: ctx.tenantId,
      ...payload,
    })
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true, data: data as Product };
}

export async function updateProduct(productId: string, updates: ProductUpdate): Promise<ActionResult<Product>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) patch.name = String(updates.name || "").trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.price !== undefined) patch.price = Math.max(0, Number(updates.price) || 0);
  if (updates.stock !== undefined) patch.stock = Math.max(0, Math.round(Number(updates.stock) || 0));
  if (updates.image_url !== undefined) patch.image_url = updates.image_url?.trim() || null;
  if (updates.keywords !== undefined) {
    patch.keywords = Array.isArray(updates.keywords)
      ? updates.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 20)
      : null;
  }
  if (updates.min_quantity !== undefined) patch.min_quantity = Math.max(1, Math.round(Number(updates.min_quantity) || 1));
  if (updates.max_quantity !== undefined) patch.max_quantity = Math.max(1, Math.round(Number(updates.max_quantity) || 1));

  const itemType = updates.item_type ? normalizeItemType(updates.item_type) : null;
  if (itemType) {
    patch.item_type = itemType;
    if (updates.unit_label === undefined) patch.unit_label = defaultUnitLabel(itemType);
  }

  if (updates.unit_label !== undefined) {
    patch.unit_label = updates.unit_label?.trim() || (itemType ? defaultUnitLabel(itemType) : "unidad");
  }

  if (updates.availability_type !== undefined || itemType) {
    patch.availability_type = normalizeAvailabilityType(
      updates.availability_type,
      itemType || normalizeItemType(String(patch.item_type || "product"))
    );
  }

  if (updates.pricing_mode !== undefined || itemType) {
    patch.pricing_mode = normalizePricingMode(
      updates.pricing_mode,
      itemType || normalizeItemType(String(patch.item_type || "product"))
    );
  }

  if (updates.attributes !== undefined) {
    patch.attributes = normalizeAttributes(updates.attributes);
  }

  if (typeof updates.is_active === "boolean") {
    patch.is_active = updates.is_active;
  }

  const { data, error } = await ctx.supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .eq("tenant_id", ctx.tenantId)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true, data: data as Product };
}

export async function updateStock(productId: string, delta: number): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: current } = await ctx.supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!current) return { success: false, error: "Item no encontrado" };

  const newStock = current.stock + delta;
  if (newStock < 0) {
    return { success: false, error: "Stock insuficiente" };
  }

  const { error } = await ctx.supabase
    .from("products")
    .update({ stock: newStock })
    .eq("id", productId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function bulkCreateProducts(
  products: ProductCreate[]
): Promise<ActionResult<{ created: number; errors: string[] }>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  if (!products.length) return { success: false, error: "No hay items para importar" };
  if (products.length > MAX_BULK_IMPORT) {
    return { success: false, error: `Maximo ${MAX_BULK_IMPORT} items por importacion` };
  }

  const errors: string[] = [];
  const valid = products
    .map((product, index) => ({ product: normalizeProductForInsert(product), index }))
    .filter(({ product, index }) => {
      if (!product.name) {
        errors.push(`Fila ${index + 1}: nombre vacio`);
        return false;
      }
      if (product.price < 0) {
        errors.push(`Fila ${index + 1}: precio negativo`);
        return false;
      }
      return true;
    });

  if (!valid.length) {
    return {
      success: false,
      error: "Ningun item valido",
      data: { created: 0, errors },
    };
  }

  const rows = valid.map(({ product }) => ({
    tenant_id: ctx.tenantId,
    ...product,
  }));

  const { error } = await ctx.supabase.from("products").insert(rows);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true, data: { created: valid.length, errors } };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { error } = await ctx.supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", productId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true };
}
