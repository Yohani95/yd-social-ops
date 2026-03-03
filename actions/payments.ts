"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getMPClient, Preference } from "@/lib/mercadopago";
import { updateStock } from "@/actions/products";
import { getAppUrl } from "@/lib/app-url";
import type { ActionResult, CreatePreferenceInput } from "@/types";

/**
 * Crea una preferencia de pago usando la configuracion del tenant.
 * - mp_oauth: crea preferencia en la cuenta MP del tenant.
 * - external_link: retorna el link global configurado por el tenant.
 * - bank_transfer: no soporta pago automatico.
 */
export async function createPreference(
  input: CreatePreferenceInput
): Promise<ActionResult<{ init_point: string; preference_id: string }>> {
  const supabase = createServiceClient();

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, mp_access_token, plan_tier, saas_subscription_status, merchant_checkout_mode, merchant_external_checkout_url")
    .eq("id", input.tenant_id)
    .single();

  if (tenantError || !tenant) {
    return { success: false, error: "Tenant no encontrado" };
  }

  const checkoutMode = tenant.merchant_checkout_mode || "bank_transfer";
  const planAllowsMPOAuth = tenant.plan_tier !== "basic";

  if (checkoutMode === "external_link") {
    const link = tenant.merchant_external_checkout_url?.trim();
    if (!link) {
      return { success: false, error: "El link externo no esta configurado en Ajustes." };
    }

    return {
      success: true,
      data: {
        init_point: link,
        preference_id: "external_link",
      },
    };
  }

  if (checkoutMode !== "mp_oauth") {
    return { success: false, error: "El modo de pago automatico no esta habilitado para este negocio." };
  }

  if (!planAllowsMPOAuth) {
    return {
      success: false,
      error: "El plan Basico no soporta OAuth de Mercado Pago. Usa link externo o transferencia.",
    };
  }

  if (!tenant.mp_access_token) {
    return {
      success: false,
      error: "Mercado Pago no esta conectado. Configuralo en Ajustes.",
    };
  }

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
    return { success: false, error: "El producto no esta disponible" };
  }

  const quantity = input.quantity || 1;

  if (product.stock < quantity) {
    return {
      success: false,
      error: `Stock insuficiente. Solo hay ${product.stock} unidades disponibles.`,
    };
  }

  try {
    const mpClient = getMPClient(tenant.mp_access_token);
    const preference = new Preference(mpClient);
    const appUrl = getAppUrl();

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
      error: "Error al conectar con Mercado Pago. Intenta mas tarde.",
    };
  }
}

/**
 * Procesa un pago aprobado: descuenta stock y registra en logs.
 */
export async function processApprovedPayment(params: {
  tenant_id: string;
  product_id: string;
  quantity: number;
  payment_id: string;
}): Promise<ActionResult> {
  const stockResult = await updateStock(params.product_id, -params.quantity);
  if (!stockResult.success) {
    console.error("[Payments] Error descontando stock:", stockResult.error);
  }

  return { success: true };
}

/**
 * Link publico de planes SaaS (fallback comercial).
 */
export async function getSaaSSubscriptionLink(
  planTier: "basic" | "pro" | "business" | "enterprise" | "enterprise_plus"
): Promise<ActionResult<{ url: string }>> {
  const planLinks: Record<string, string> = {
    basic: process.env.MP_PLAN_BASIC_LINK || "",
    pro: process.env.MP_PLAN_PRO_LINK || "",
    business: process.env.MP_PLAN_BUSINESS_LINK || "",
    enterprise: process.env.MP_PLAN_ENTERPRISE_LINK || "",
    enterprise_plus: process.env.MP_PLAN_ENTERPRISE_PLUS_LINK || "",
  };

  const link = planLinks[planTier];
  if (!link) {
    return {
      success: false,
      error: "Link de suscripcion no configurado para este plan",
    };
  }

  return { success: true, data: { url: link } };
}
