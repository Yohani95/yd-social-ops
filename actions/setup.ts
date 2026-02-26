"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import type {
  ActionResult,
  AvailabilityType,
  BotTone,
  BusinessType,
  ContactAction,
  ItemType,
  ProductCreate,
} from "@/types";

interface ParseProductsResult {
  products: ProductCreate[];
  warnings: string[];
}

interface CompleteSetupParams {
  business_name: string;
  business_type: BusinessType;
  business_description?: string | null;
  contact_action: ContactAction;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  contact_custom_message?: string | null;
  bot_name: string;
  bot_tone: BotTone;
  bot_welcome_message: string;
  products?: ProductCreate[];
}

const SERVICE_HINTS = [
  "caba",
  "reserva",
  "sesion",
  "consulta",
  "turno",
  "hora",
  "noche",
  "masaje",
  "tour",
  "agenda",
  "servicio",
];

const INFO_HINTS = ["informacion", "horario", "ubicacion", "faq", "preguntas"];

const STOP_WORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "con",
  "sin",
  "por",
  "para",
  "una",
  "uno",
  "del",
  "que",
  "como",
  "sobre",
  "incluye",
  "incluido",
  "incluida",
  "desde",
  "hasta",
  "tipo",
  "precio",
  "valor",
  "oferta",
]);

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitCatalogText(raw: string): string[] {
  const clean = raw.replace(/\r/g, "").trim();
  if (!clean) return [];

  if (clean.includes("\n")) {
    return clean
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);
  }

  return clean
    .split(/,(?=\s*[A-Za-z0-9])/)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter(Boolean);
}

function parseInteger(raw: string): number {
  const onlyDigits = raw.replace(/[^\d]/g, "");
  if (!onlyDigits) return 0;
  return Number.parseInt(onlyDigits, 10) || 0;
}

function extractPrice(item: string): number {
  const contextual =
    item.match(/(?:precio|valor|cuesta|sale|noche|hora|sesion)\s*[:\-]?\s*\$?\s*([\d.\s]{3,})/i) ||
    item.match(/\$\s*([\d.\s]{3,})/);
  if (contextual?.[1]) return parseInteger(contextual[1]);

  const allNumbers = item.match(/(?:\d{1,3}(?:[.\s]\d{3})+|\d{3,})/g);
  if (!allNumbers?.length) return 0;
  const parsed = allNumbers.map((n) => parseInteger(n)).filter((n) => n > 0);
  if (!parsed.length) return 0;
  return Math.max(...parsed);
}

function inferItemType(item: string, businessType: BusinessType): ItemType {
  if (businessType === "products") return "product";
  if (businessType === "services" || businessType === "professional") return "service";

  const lower = item.toLowerCase();
  if (INFO_HINTS.some((k) => lower.includes(k))) return "info";
  if (SERVICE_HINTS.some((k) => lower.includes(k))) return "service";
  return "product";
}

function inferUnitLabel(item: string, itemType: ItemType): string {
  if (itemType !== "service") return "unidad";

  const lower = item.toLowerCase();
  if (lower.includes("noche")) return "noche";
  if (lower.includes("hora")) return "hora";
  if (lower.includes("sesion")) return "sesion";
  if (lower.includes("persona")) return "persona";
  return "unidad";
}

function inferAvailabilityType(item: string, itemType: ItemType): AvailabilityType {
  if (itemType !== "service") return "stock";
  const lower = item.toLowerCase();
  if (lower.includes("check-in") || lower.includes("checkout") || lower.includes("noche") || lower.includes("reserva")) {
    return "calendar";
  }
  if (lower.includes("hora") || lower.includes("sesion") || lower.includes("agenda")) {
    return "quota";
  }
  return "stock";
}

function extractName(item: string): string {
  let name = item;
  name = name.replace(/\([^)]*\)/g, " ");
  name = name.replace(/(?:precio|valor|cuesta|sale)\s*[:\-]?\s*\$?\s*[\d.\s]+/gi, " ");
  name = name.replace(/\$\s*[\d.\s]+/g, " ");
  name = normalizeWhitespace(name);
  if (!name) return item.slice(0, 80).trim();
  return name.slice(0, 120);
}

function extractDescription(item: string, name: string): string | null {
  const maybeDescription = normalizeWhitespace(item.replace(name, "").replace(/^[,.;:\- ]+/, ""));
  if (!maybeDescription) return null;
  return maybeDescription.slice(0, 500);
}

function extractKeywords(item: string, name: string): string[] | null {
  const source = `${name} ${item}`.toLowerCase();
  const tokens = source.match(/[a-z0-9]+/g) || [];
  const unique = Array.from(
    new Set(tokens.filter((t) => t.length >= 3 && !STOP_WORDS.has(t)))
  );
  return unique.length ? unique.slice(0, 12) : null;
}

function buildProductFromText(item: string, businessType: BusinessType): ProductCreate | null {
  const normalized = normalizeWhitespace(item);
  if (!normalized) return null;

  const itemType = inferItemType(normalized, businessType);
  const price = itemType === "info" ? 0 : extractPrice(normalized);
  const name = extractName(normalized);
  if (!name) return null;

  const availabilityType = inferAvailabilityType(normalized, itemType);
  const unitLabel = inferUnitLabel(normalized, itemType);
  const description = extractDescription(normalized, name);
  const keywords = extractKeywords(normalized, name);

  return {
    name,
    description,
    price,
    stock: itemType === "service" ? 1 : itemType === "info" ? 0 : 10,
    item_type: itemType,
    keywords,
    image_url: null,
    unit_label: unitLabel,
    availability_type: availabilityType,
    min_quantity: 1,
    max_quantity: itemType === "service" && availabilityType === "calendar" ? 30 : 99,
  };
}

function sanitizeProducts(products: ProductCreate[]): ProductCreate[] {
  const seen = new Set<string>();
  const sanitized: ProductCreate[] = [];

  for (const product of products) {
    const name = product.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    sanitized.push({
      ...product,
      name,
      description: product.description?.trim() || null,
      price: Number.isFinite(product.price) ? Math.max(0, Math.round(product.price)) : 0,
      stock: Number.isFinite(product.stock) ? Math.max(0, Math.round(product.stock)) : 0,
      unit_label: product.unit_label || "unidad",
      availability_type: product.availability_type || "stock",
      min_quantity: Number.isFinite(product.min_quantity ?? 1) ? Math.max(1, Math.round(product.min_quantity ?? 1)) : 1,
      max_quantity: Number.isFinite(product.max_quantity ?? 99) ? Math.max(1, Math.round(product.max_quantity ?? 99)) : 99,
      item_type: product.item_type || "product",
      keywords: product.keywords?.filter(Boolean) || null,
      image_url: product.image_url || null,
    });
  }

  return sanitized;
}

export async function parseProductsFromText(
  catalogText: string,
  businessType: BusinessType
): Promise<ActionResult<ParseProductsResult>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };

  const limited = catalogText.slice(0, 5000).trim();
  if (!limited) {
    return {
      success: false,
      error: "Pega texto con productos o servicios para analizar",
    };
  }

  const chunks = splitCatalogText(limited).slice(0, 120);
  const warnings: string[] = [];
  const parsed = chunks
    .map((chunk, index) => {
      const product = buildProductFromText(chunk, businessType);
      if (!product) {
        warnings.push(`Linea ${index + 1}: no se pudo interpretar`);
        return null;
      }
      if (product.item_type !== "info" && product.price <= 0) {
        warnings.push(`Linea ${index + 1}: precio no detectado, se dejo en 0`);
      }
      return product;
    })
    .filter(Boolean) as ProductCreate[];

  const products = sanitizeProducts(parsed);
  if (!products.length) {
    return {
      success: false,
      error: "No se pudieron extraer items validos",
      data: { products: [], warnings },
    };
  }

  return {
    success: true,
    data: { products, warnings },
  };
}

export async function completeSetupWizard(
  params: CompleteSetupParams
): Promise<ActionResult<{ created_products: number; skipped_products: number }>> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) return { success: false, error: "No autenticado" };
  if (ctx.userRole !== "owner" && ctx.userRole !== "admin") {
    return { success: false, error: "Sin permisos" };
  }

  const businessName = params.business_name.trim();
  if (!businessName) return { success: false, error: "Nombre del negocio requerido" };

  const tenantUpdate = {
    business_name: businessName,
    business_type: params.business_type,
    business_description: params.business_description?.trim() || null,
    contact_action: params.contact_action,
    contact_whatsapp: params.contact_whatsapp?.trim() || null,
    contact_email: params.contact_email?.trim() || null,
    contact_custom_message: params.contact_custom_message?.trim() || null,
    bot_name: params.bot_name.trim() || "Asistente",
    bot_tone: params.bot_tone,
    bot_welcome_message: params.bot_welcome_message.trim() || "Hola, en que puedo ayudarte?",
    updated_at: new Date().toISOString(),
  };

  const { error: tenantError } = await ctx.supabase
    .from("tenants")
    .update(tenantUpdate)
    .eq("id", ctx.tenantId);

  if (tenantError) return { success: false, error: tenantError.message };

  const incomingProducts = sanitizeProducts(params.products || []);
  let createdProducts = 0;
  let skippedProducts = 0;

  if (incomingProducts.length) {
    const { data: existingRows } = await ctx.supabase
      .from("products")
      .select("name")
      .eq("tenant_id", ctx.tenantId);

    const existingNames = new Set(
      (existingRows || []).map((row) => String(row.name || "").trim().toLowerCase()).filter(Boolean)
    );

    const rowsToInsert = incomingProducts
      .filter((p) => !existingNames.has(p.name.trim().toLowerCase()))
      .map((p) => ({
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

    skippedProducts = incomingProducts.length - rowsToInsert.length;

    if (rowsToInsert.length) {
      const { error: insertError } = await ctx.supabase.from("products").insert(rowsToInsert);
      if (insertError) return { success: false, error: insertError.message };
      createdProducts = rowsToInsert.length;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/setup");

  return {
    success: true,
    data: {
      created_products: createdProducts,
      skipped_products: skippedProducts,
    },
  };
}
