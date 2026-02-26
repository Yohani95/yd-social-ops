"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, Product, ProductCreate, ProductUpdate } from "@/types";

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

export async function createProduct(
  product: ProductCreate
): Promise<ActionResult<Product>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  if (!product.name?.trim()) {
    return { success: false, error: "El nombre del producto es requerido" };
  }
  if (product.price < 0) {
    return { success: false, error: "El precio no puede ser negativo" };
  }

  const { data, error } = await ctx.supabase
    .from("products")
    .insert({
      tenant_id: ctx.tenantId,
      name: product.name.trim(),
      description: product.description?.trim() || null,
      price: product.price,
      stock: product.stock ?? 0,
      unit_label: product.unit_label || "unidad",
      availability_type: product.availability_type || "stock",
      min_quantity: product.min_quantity ?? 1,
      max_quantity: product.max_quantity ?? 99,
      keywords: product.keywords?.filter(Boolean) || null,
      image_url: product.image_url || null,
      item_type: product.item_type || "product",
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true, data: data as Product };
}

export async function updateProduct(
  productId: string,
  updates: ProductUpdate
): Promise<ActionResult<Product>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data, error } = await ctx.supabase
    .from("products")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/products");
  return { success: true, data: data as Product };
}

export async function updateStock(
  productId: string,
  delta: number
): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const { data: current } = await ctx.supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!current) return { success: false, error: "Producto no encontrado" };

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

  if (!products.length) return { success: false, error: "No hay productos para importar" };
  if (products.length > 500) return { success: false, error: "Máximo 500 productos por importación" };

  const errors: string[] = [];
  const valid = products.filter((p, i) => {
    if (!p.name?.trim()) { errors.push(`Fila ${i + 1}: nombre vacío`); return false; }
    if (p.price < 0) { errors.push(`Fila ${i + 1}: precio negativo`); return false; }
    return true;
  });

  if (!valid.length) return { success: false, error: "Ningún producto válido", data: { created: 0, errors } };

  const rows = valid.map((p) => ({
    tenant_id: ctx.tenantId,
    name: p.name.trim(),
    description: p.description?.trim() || null,
    price: p.price,
    stock: p.stock ?? 0,
    unit_label: p.unit_label || "unidad",
    availability_type: p.availability_type || "stock",
    min_quantity: p.min_quantity ?? 1,
    max_quantity: p.max_quantity ?? 99,
    keywords: p.keywords?.filter(Boolean) || null,
    image_url: p.image_url || null,
    item_type: p.item_type || "product",
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
