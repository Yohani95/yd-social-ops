"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMPClient, getSaaSMPClient, Preference } from "@/lib/mercadopago";
import { updateStock } from "@/actions/products";
import type { ActionResult, CreatePreferenceInput } from "@/types";

/**
 * Crea una preferencia de pago de Mercado Pago usando el token DEL TENANT.
 * Usado cuando el bot detecta intención de compra (Plan Pro/Enterprise).
 */
export async function createPreference(
  input: CreatePreferenceInput
): Promise<ActionResult<{ init_point: string; preference_id: string }>> {
  const supabase = createServiceClient();

  // Obtener tenant con sus tokens MP
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, mp_access_token, plan_tier, saas_subscription_status")
    .eq("id", input.tenant_id)
    .single();

  if (tenantError || !tenant) {
    return { success: false, error: "Tenant no encontrado" };
  }

  if (tenant.plan_tier === "basic") {
    return { success: false, error: "El Plan Básico no soporta pagos automáticos" };
  }

  if (!tenant.mp_access_token) {
    return {
      success: false,
      error: "Mercado Pago no está conectado. Configúralo en Ajustes.",
    };
  }

  // Obtener producto
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, price, stock, is_active")
    .eq("id", input.product_id)
    .eq("tenant_id", input.tenant_id)
    .single();

  if (productError || !product) {
    return { success: false, error: "Producto no encontrado" };
  }

  if (!product.is_active) {
    return { success: false, error: "El producto no está disponible" };
  }

  const quantity = input.quantity || 1;

  if (product.stock < quantity) {
    return {
      success: false,
      error: `Stock insuficiente. Solo hay ${product.stock} unidades disponibles.`,
    };
  }

  try {
    // Crear preferencia con el token DEL TENANT
    const mpClient = getMPClient(tenant.mp_access_token);
    const preference = new Preference(mpClient);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const result = await preference.create({
      body: {
        items: [
          {
            id: product.id,
            title: product.name,
            quantity,
            unit_price: Number(product.price),
            currency_id: "CLP",
          },
        ],
        back_urls: {
          success: `${appUrl}/payment/success`,
          failure: `${appUrl}/payment/failure`,
          pending: `${appUrl}/payment/pending`,
        },
        auto_return: "approved",
        notification_url: `${appUrl}/api/webhooks/payment?tenant_id=${input.tenant_id}`,
        metadata: {
          tenant_id: input.tenant_id,
          product_id: input.product_id,
          quantity,
        },
        // marketplace_fee: 0, // Descomentar para cobrar comisión de marketplace en el futuro
      },
    });

    if (!result.init_point) {
      return { success: false, error: "No se pudo generar el link de pago" };
    }

    return {
      success: true,
      data: {
        init_point: result.init_point,
        preference_id: result.id || "",
      },
    };
  } catch (error) {
    console.error("[Payments] Error creando preferencia:", error);
    return {
      success: false,
      error: "Error al conectar con Mercado Pago. Intenta más tarde.",
    };
  }
}

/**
 * Procesa un pago aprobado: descuenta stock y registra en logs.
 * Llamado desde el webhook de pago del tenant.
 */
export async function processApprovedPayment(params: {
  tenant_id: string;
  product_id: string;
  quantity: number;
  payment_id: string;
}): Promise<ActionResult> {
  // Descontar stock
  const stockResult = await updateStock(params.product_id, -params.quantity);
  if (!stockResult.success) {
    console.error("[Payments] Error descontando stock:", stockResult.error);
  }

  return { success: true };
}

/**
 * Crea un link de suscripción del SaaS (usando TU cuenta de MP).
 * Retorna la URL para que el cliente pague tu servicio.
 */
export async function getSaaSSubscriptionLink(
  planTier: "basic" | "pro" | "enterprise"
): Promise<ActionResult<{ url: string }>> {
  const planLinks: Record<string, string> = {
    // Configura estos links en tu dashboard de Mercado Pago
    // Como Links de Pago recurrentes o planes de suscripción
    basic: process.env.MP_PLAN_BASIC_LINK || "",
    pro: process.env.MP_PLAN_PRO_LINK || "",
    enterprise: process.env.MP_PLAN_ENTERPRISE_LINK || "",
  };

  const link = planLinks[planTier];
  if (!link) {
    return {
      success: false,
      error: "Link de suscripción no configurado para este plan",
    };
  }

  return { success: true, data: { url: link } };
}
