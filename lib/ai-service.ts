import { createServiceClient } from "@/lib/supabase/server";
import { getMPClient, Preference } from "@/lib/mercadopago";
import { callAI, callAIWithToolResult, type AIMessage, type AITool } from "@/lib/ai-providers";
import type { BotRequest, BotResponse, Product, Tenant } from "@/types";

// ============================================================
// PASO A: Obtener contexto del tenant
// ============================================================
async function getTenantContext(tenantId: string): Promise<{
  tenant: Tenant;
  products: Product[];
}> {
  const supabase = createServiceClient();

  const [tenantResult, productsResult] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).single(),
    supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error(`Tenant no encontrado: ${tenantId}`);
  }

  return {
    tenant: tenantResult.data as Tenant,
    products: (productsResult.data as Product[]) ?? [],
  };
}

// ============================================================
// PASO B: Construir System Prompt dinámico y flexible
// ============================================================
function buildSystemPrompt(tenant: Tenant, products: Product[]): string {
  const botName = tenant.bot_name || "Asistente";
  const businessName = tenant.business_name || "nuestro negocio";
  const businessType = tenant.business_type || "products";
  const businessDesc = tenant.business_description
    ? `\nDESCRIPCIÓN DEL NEGOCIO: ${tenant.business_description}`
    : "";

  const roleLabel: Record<string, string> = {
    products: "asistente de ventas virtual",
    services: "asistente de reservas y servicios",
    professional: "asistente virtual de atención",
    mixed: "asistente virtual",
  };

  const goalLabel: Record<string, string> = {
    products: "ayudar a los clientes con sus consultas y facilitar sus compras",
    services: "ayudar a los clientes a conocer los servicios disponibles y facilitar sus reservas",
    professional: "atender consultas de potenciales clientes y orientarlos sobre los servicios profesionales disponibles",
    mixed: "ayudar a los clientes con productos, servicios y consultas",
  };

  const catalog = buildCatalogSection(products, businessType);
  const toneInstructions = buildToneInstructions(tenant.bot_tone || "amigable");
  const contactInstructions = buildContactInstructions(tenant);

  return `Eres ${botName}, ${roleLabel[businessType] || "asistente virtual"} de "${businessName}".${businessDesc}
Tu objetivo es ${goalLabel[businessType] || goalLabel.mixed}.

${catalog}

TONO DE COMUNICACIÓN:
${toneInstructions}

INSTRUCCIONES GENERALES:
- Responde siempre en español.
- Busca en el catálogo y proporciona información precisa.
- Si un item tiene stock y este es 0, informa que no está disponible.
- Mantén las respuestas concisas (máximo 3 párrafos).
- No inventes items que no estén en el catálogo.

${contactInstructions}`;
}

function buildCatalogSection(products: Product[], businessType: string): string {
  if (products.length === 0) {
    const emptyLabel: Record<string, string> = {
      products: "No hay productos disponibles en este momento.",
      services: "No hay servicios disponibles en este momento.",
      professional: "No hay información de servicios configurada.",
      mixed: "No hay items disponibles en este momento.",
    };
    return `CATÁLOGO:\n${emptyLabel[businessType] || emptyLabel.mixed}`;
  }

  const headerLabel: Record<string, string> = {
    products: "CATÁLOGO DE PRODUCTOS",
    services: "SERVICIOS DISPONIBLES",
    professional: "ÁREAS DE ATENCIÓN",
    mixed: "CATÁLOGO",
  };

  const lines = products.map((p) => {
    const typeTag = p.item_type === "service" ? "[Servicio]" : p.item_type === "info" ? "[Info]" : "[Producto]";
    const priceStr = p.item_type !== "info" && Number(p.price) > 0
      ? ` | Precio: $${Number(p.price).toLocaleString("es-CL")}`
      : "";
    const stockStr = p.item_type === "product" ? ` | Stock: ${p.stock} unidades` : p.item_type === "service" && p.stock > 0 ? ` | Disponibilidad: ${p.stock}` : "";
    const descStr = p.description ? ` | ${p.description}` : "";
    return `- ${typeTag} ${p.name} (ID: ${p.id})${priceStr}${stockStr}${descStr}`;
  });

  return `${headerLabel[businessType] || headerLabel.mixed}:\n${lines.join("\n")}`;
}

function buildToneInstructions(tone: string): string {
  switch (tone) {
    case "formal":
      return "- Trata al cliente de usted.\n- No uses emojis.\n- Lenguaje corporativo, respetuoso y profesional.";
    case "informal":
      return "- Tutea al cliente.\n- Puedes usar emojis con moderación.\n- Lenguaje casual y cercano, como si hablaras con un amigo.";
    case "amigable":
    default:
      return "- Equilibrio entre profesional y cercano.\n- Puedes usar emojis ocasionalmente.\n- Tono cálido pero respetuoso.";
  }
}

function buildContactInstructions(tenant: Tenant): string {
  const contactAction = tenant.contact_action || "payment_link";

  switch (contactAction) {
    case "whatsapp_contact": {
      const wa = tenant.contact_whatsapp || "";
      const waClean = wa.replace(/[^0-9]/g, "");
      return `CUANDO EL CLIENTE QUIERA COMPRAR/RESERVAR/CONTRATAR:
- Proporciona toda la información relevante del catálogo.
- Indica al cliente que para concretar, puede contactar directamente por WhatsApp: https://wa.me/${waClean}
- NO generes links de pago ni menciones sistemas de pago automáticos.`;
    }
    case "email_contact": {
      const email = tenant.contact_email || "";
      return `CUANDO EL CLIENTE QUIERA COMPRAR/RESERVAR/CONTRATAR:
- Proporciona toda la información relevante del catálogo.
- Indica al cliente que para concretar, puede escribir a: ${email}
- NO generes links de pago ni menciones sistemas de pago automáticos.`;
    }
    case "custom_message": {
      const msg = tenant.contact_custom_message || "Contacta directamente al negocio para más información.";
      return `CUANDO EL CLIENTE QUIERA COMPRAR/RESERVAR/CONTRATAR:
- Proporciona toda la información relevante del catálogo.
- Responde con este mensaje de contacto: ${msg}
- NO generes links de pago ni menciones sistemas de pago automáticos.`;
    }
    case "payment_link":
    default: {
      if (tenant.plan_tier === "basic") {
        const bankDetails = tenant.bank_details || "Datos bancarios no configurados. Contacta directamente al negocio.";
        return `MÉTODO DE PAGO (TRANSFERENCIA):
Cuando un cliente quiera comprar, proporciona estos datos de transferencia:
${bankDetails}
- NO generes links de pago.
- Indica al cliente que envíe el comprobante por este mismo chat.`;
      }
      return `MÉTODO DE PAGO (AUTOMÁTICO):
Cuando un cliente quiera comprar:
1. Confirma qué producto/servicio quiere y la cantidad.
2. Verifica stock/disponibilidad.
3. Llama a la función "generate_payment_link" con el product_id correspondiente.
4. El sistema generará automáticamente un link de pago seguro.
- SIEMPRE usa la función generate_payment_link, no inventes URLs.
- Si no hay stock, informa amablemente y ofrece alternativas.`;
    }
  }
}

// ============================================================
// Tool definition (compatible con OpenAI y Gemini)
// ============================================================
const generatePaymentLinkTool: AITool = {
  name: "generate_payment_link",
  description:
    "Genera un link de pago de Mercado Pago para que el cliente pueda pagar de forma segura. Úsalo cuando el cliente confirme que quiere comprar.",
  parameters: {
    type: "object",
    properties: {
      product_id: {
        type: "string",
        description: "El ID del producto a comprar (del catálogo)",
      },
      quantity: {
        type: "number",
        description: "Cantidad de unidades a comprar",
        default: 1,
      },
    },
    required: ["product_id"],
  },
};

// ============================================================
// Ejecutar tool: generar preferencia de pago MP
// ============================================================
async function executeGeneratePaymentLink(
  args: { product_id: string; quantity?: number },
  tenant: Tenant,
  products: Product[]
): Promise<{ link: string; product_name: string } | { error: string }> {
  const product = products.find((p) => p.id === args.product_id);

  if (!product) {
    return { error: "Producto no encontrado en el catálogo." };
  }

  const quantity = args.quantity || 1;

  if (product.stock < quantity) {
    return {
      error: `Solo hay ${product.stock} unidades disponibles de "${product.name}".`,
    };
  }

  if (!tenant.mp_access_token) {
    return { error: "El sistema de pagos no está configurado aún." };
  }

  try {
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
        metadata: {
          tenant_id: tenant.id,
          product_id: product.id,
          quantity,
        },
      },
    });

    return {
      link: result.init_point || "",
      product_name: product.name,
    };
  } catch (error) {
    console.error("[AI Service] Error generando preferencia MP:", error);
    return { error: "No se pudo generar el link de pago. Intenta más tarde." };
  }
}

// ============================================================
// FUNCIÓN PRINCIPAL: processMessage
// ============================================================
export async function processMessage(
  request: BotRequest
): Promise<BotResponse> {
  const { tenant_id, user_message } = request;

  // Obtener contexto
  const { tenant, products } = await getTenantContext(tenant_id);

  // Verificar suscripción
  if (tenant.saas_subscription_status === "inactive") {
    return {
      message:
        "El servicio no está disponible en este momento. Por favor contacta al administrador.",
      intent_detected: "unknown",
    };
  }

  // Construir mensajes
  const systemPrompt = buildSystemPrompt(tenant, products);
  const usePaymentTools =
    (tenant.contact_action || "payment_link") === "payment_link" &&
    (tenant.plan_tier === "pro" || tenant.plan_tier === "enterprise");

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: user_message },
  ];

  const tools = usePaymentTools ? [generatePaymentLinkTool] : undefined;

  // Llamar a la IA (con fallback automático)
  let aiResponse = await callAI(messages, tools);

  let paymentLink: string | undefined;
  let detectedProductId: string | undefined;

  // Procesar tool calls si los hay
  if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
    for (const toolCall of aiResponse.toolCalls) {
      if (toolCall.name === "generate_payment_link") {
        const result = await executeGeneratePaymentLink(
          toolCall.arguments as { product_id: string; quantity?: number },
          tenant,
          products
        );

        let toolResultContent: string;

        if ("error" in result) {
          toolResultContent = `Error: ${result.error}`;
        } else {
          paymentLink = result.link;
          detectedProductId = (toolCall.arguments as { product_id: string }).product_id;
          toolResultContent = JSON.stringify({
            payment_link: result.link,
            product_name: result.product_name,
            message: "Link de pago generado exitosamente",
          });
        }

        // Segunda llamada con resultado del tool
        aiResponse = await callAIWithToolResult(
          messages,
          aiResponse.provider,
          toolCall.id,
          toolCall.name,
          toolResultContent
        );
      }
    }
  }

  // Detectar intención
  const intent = detectIntent(user_message, paymentLink);

  // Guardar log
  await saveChatLog({
    tenant_id,
    user_message,
    bot_response: aiResponse.content,
    intent_detected: intent,
    product_id: detectedProductId,
    payment_link: paymentLink,
    session_id: request.session_id,
    user_identifier: request.user_identifier,
    channel: request.channel || "web",
    tokens_used: aiResponse.tokensUsed,
  });

  return {
    message: aiResponse.content || "No pude procesar tu mensaje.",
    payment_link: paymentLink,
    intent_detected: intent,
    product_id: detectedProductId,
  };
}

// ============================================================
// HELPERS
// ============================================================

function detectIntent(
  message: string,
  hasPaymentLink?: string
): BotResponse["intent_detected"] {
  if (hasPaymentLink) return "purchase_intent";

  const lower = message.toLowerCase();
  const purchaseKeywords = ["comprar", "quiero", "precio", "costo", "cuánto", "pagar", "llevar", "adquirir"];
  const greetingKeywords = ["hola", "buenos", "buen día", "buenas", "saludos"];
  const complaintKeywords = ["problema", "queja", "mal", "error", "falla", "defecto", "roto"];

  if (purchaseKeywords.some((k) => lower.includes(k))) return "purchase_intent";
  if (greetingKeywords.some((k) => lower.includes(k))) return "greeting";
  if (complaintKeywords.some((k) => lower.includes(k))) return "complaint";

  return "inquiry";
}

async function saveChatLog(data: {
  tenant_id: string;
  user_message: string;
  bot_response: string;
  intent_detected: BotResponse["intent_detected"];
  product_id?: string;
  payment_link?: string;
  session_id?: string;
  user_identifier?: string;
  channel: string;
  tokens_used: number;
}) {
  try {
    const supabase = createServiceClient();
    await supabase.from("chat_logs").insert({
      tenant_id: data.tenant_id,
      session_id: data.session_id,
      user_identifier: data.user_identifier,
      user_message: data.user_message,
      bot_response: data.bot_response,
      intent_detected: data.intent_detected,
      product_id: data.product_id || null,
      payment_link: data.payment_link || null,
      channel: data.channel,
      tokens_used: data.tokens_used,
    });
  } catch (error) {
    console.error("[AI Service] Error guardando chat_log:", error);
  }
}
