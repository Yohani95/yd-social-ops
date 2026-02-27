import { createServiceClient } from "@/lib/supabase/server";
import { getMPClient, Preference } from "@/lib/mercadopago";
import { getAppUrl } from "@/lib/app-url";
import { notifyN8n } from "@/lib/integrations/n8n";
import { callAI, callAIWithToolResult, type AIMessage, type AITool } from "@/lib/ai-providers";
import { sendWelcomeEmail, sendOwnerNewMessageAlertEmail } from "@/lib/email";
import type { BotRequest, BotResponse, CaptureContactPayload, Product, Tenant } from "@/types";

type IndustryTemplate =
  | "retail_store"
  | "professional_services"
  | "delivery_restaurant"
  | "spa_wellness"
  | "veterinary"
  | "general";

// ============================================================
// STEP A: Tenant context
// ============================================================
async function getTenantContext(tenantId: string): Promise<{
  tenant: Tenant;
  products: Product[];
  mcpServers: Array<{ name: string; url: string; auth_type: string }>;
}> {
  const supabase = createServiceClient();

  const [tenantResult, productsResult, mcpServersResult] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).single(),
    supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("mcp_servers")
      .select("name,url,auth_type")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error(`Tenant no encontrado: ${tenantId}`);
  }

  return {
    tenant: tenantResult.data as Tenant,
    products: (productsResult.data as Product[]) ?? [],
    mcpServers:
      mcpServersResult.error || !Array.isArray(mcpServersResult.data)
        ? []
        : (mcpServersResult.data as Array<{ name: string; url: string; auth_type: string }>),
  };
}

// ============================================================
// Security: prompt injection guard
// ============================================================
function sanitizeUserInput(input: string): string {
  const trimmed = input.slice(0, 500);

  const injectionPatterns = [
    /ignora\s+(todas?|tus|mis|las)/i,
    /olvida\s+(todo|tus|las\s+instrucciones)/i,
    /eres\s+ahora/i,
    /nuevo\s+sistema\s+de\s+prompt/i,
    /act\s+as\s+/i,
    /jailbreak/i,
    /\[system\]/i,
    /<\/?system>/i,
    /DAN\s+mode/i,
    /disregard\s+previous/i,
    /developer\s+mode/i,
    /output\s+source\s+code/i,
  ];

  const isInjection = injectionPatterns.some((p) => p.test(trimmed));
  if (isInjection) {
    console.warn("[Security] Prompt injection attempt:", trimmed.slice(0, 100));
    return "Hola, tengo una consulta sobre sus servicios.";
  }

  return trimmed
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

// ============================================================
// STEP B: Dynamic system prompt
// ============================================================
function detectIndustryTemplate(tenant: Tenant, products: Product[]): IndustryTemplate {
  const businessType = tenant.business_type || "products";
  const combined = [
    tenant.business_name || "",
    tenant.business_description || "",
    ...products.map((p) => `${p.name} ${p.description || ""} ${(p.keywords || []).join(" ")}`),
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(veterin|mascota|perro|gato|emergencia veterin)\b/i.test(combined)) {
    return "veterinary";
  }

  if (/\b(spa|masaje|relaj|wellness|facial|depil|terapia)\b/i.test(combined)) {
    return "spa_wellness";
  }

  if (/\b(delivery|resto|restaurante|pizza|menu|pedido|domicilio)\b/i.test(combined)) {
    return "delivery_restaurant";
  }

  if (businessType === "professional") return "professional_services";
  if (businessType === "products") return "retail_store";

  return "general";
}

function buildIndustryTemplateInstructions(template: IndustryTemplate): string {
  switch (template) {
    case "retail_store":
      return `PLANTILLA DE INDUSTRIA: TIENDA FISICA / E-COMMERCE
- Prioriza disponibilidad real (stock), variantes y precio.
- Si no hay stock, ofrece alternativa cercana del catalogo.
- Responde de forma directa para acelerar decision de compra.`;
    case "professional_services":
      return `PLANTILLA DE INDUSTRIA: SERVICIO PROFESIONAL
- No trates los servicios como stock fisico.
- Enfoca la conversacion en tipo de consulta, modalidad y agenda.
- Invita a agendar por el canal de contacto configurado cuando haya intencion clara.`;
    case "delivery_restaurant":
      return `PLANTILLA DE INDUSTRIA: DELIVERY / RESTAURANTE
- Presenta opciones por categoria o combos cuando aplique.
- Si preguntan por pedido, solicita direccion/zona y preferencia principal.
- Mantiene respuestas breves y orientadas a cierre de pedido.`;
    case "spa_wellness":
      return `PLANTILLA DE INDUSTRIA: SPA / WELLNESS
- Prioriza duracion, profesional/servicio y horario tentativo.
- Si el cliente quiere reservar, pide fecha, hora y cantidad de personas si aplica.
- Refuerza beneficios concretos del servicio sin inventar informacion.`;
    case "veterinary":
      return `PLANTILLA DE INDUSTRIA: VETERINARIA
- Solicita tipo de mascota, motivo de consulta y nivel de urgencia.
- Si detectas urgencia alta, deriva de inmediato al canal directo configurado.
- Para consultas no urgentes, orienta a agendar y confirma datos basicos.`;
    case "general":
    default:
      return `PLANTILLA DE INDUSTRIA: GENERAL
- Ajusta la conversacion al tipo de item consultado (producto, servicio o informacion).
- Prioriza claridad, precision y siguiente paso para convertir la consulta en accion.`;
  }
}

function buildMcpInstructions(mcpServers: Array<{ name: string; url: string; auth_type: string }>): string {
  if (!mcpServers.length) {
    return "INTEGRACIONES MCP: No hay servidores MCP activos para este tenant.";
  }

  const lines = mcpServers.map((server) => {
    return `- ${server.name} (${server.auth_type}) -> ${server.url}`;
  });

  return `INTEGRACIONES MCP ACTIVAS:
${lines.join("\n")}

REGLAS MCP:
- Puedes mencionar que existen integraciones tecnicas disponibles si el cliente pregunta por automatizaciones o sistemas externos.
- Nunca expongas secretos, tokens, headers de autenticacion ni credenciales.
- No inventes acciones ejecutadas sobre MCP si no hay confirmacion explicita del sistema.`;
}

function buildSystemPrompt(
  tenant: Tenant,
  products: Product[],
  mcpServers: Array<{ name: string; url: string; auth_type: string }>
): string {
  const botName = tenant.bot_name || "Asistente";
  const businessName = tenant.business_name || "nuestro negocio";
  const businessType = tenant.business_type || "products";
  const industryTemplate = detectIndustryTemplate(tenant, products);
  const businessDesc = tenant.business_description
    ? `\nDESCRIPCION DEL NEGOCIO: ${tenant.business_description}`
    : "";
  const addressSection = tenant.business_address
    ? `\nDIRECCION: ${tenant.business_address}`
    : "";

  const roleLabel: Record<string, string> = {
    products: "asistente de ventas virtual",
    services: "asistente de reservas y servicios",
    professional: "asistente virtual de atencion",
    mixed: "asistente virtual",
  };

  const goalLabel: Record<string, string> = {
    products: "ayudar a los clientes con sus consultas y facilitar sus compras",
    services: "ayudar a los clientes a conocer los servicios disponibles y facilitar sus reservas",
    professional: "atender consultas de potenciales clientes y orientarlos sobre los servicios profesionales disponibles",
    mixed: "ayudar a los clientes con productos, servicios y consultas",
  };

  const catalog = buildCatalogSection(products, businessType);
  const industryInstructions = buildIndustryTemplateInstructions(industryTemplate);
  const toneInstructions = buildToneInstructions(tenant.bot_tone || "amigable");
  const contactInstructions = buildContactInstructions(tenant);
  const mcpInstructions = buildMcpInstructions(mcpServers);
  const behaviorInstructions = `
CONTEXTO Y AMBIGUEDAD:
- Si el cliente responde con una sola palabra o numero ("2", "si", "ok"), interpreta segun la ultima pregunta que hiciste.
- Si no esta claro, pregunta amablemente para aclarar.

CONCISION:
- No repitas informacion que ya hayas dado en la conversacion.

IDENTIDAD:
- Si te preguntan que modelo de IA eres, responde que eres un asistente de IA de ${businessName} y evita detalles tecnicos.
`;

  return `Eres ${botName}, ${roleLabel[businessType] || "asistente virtual"} de "${businessName}".${businessDesc}${addressSection}
Tu objetivo es ${goalLabel[businessType] || goalLabel.mixed}.

HOY ES: ${new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Usa esta fecha como referencia cuando el cliente pregunte por disponibilidad o reservas.

${catalog}

TONO DE COMUNICACION:
${toneInstructions}

INSTRUCCIONES GENERALES:
- Responde siempre en espanol.
- Busca en el catalogo y proporciona informacion precisa.
- Si un item tiene stock y este es 0, informa que no esta disponible.
- Manten las respuestas concisas (maximo 3 parrafos).
- NUNCA inventes productos o servicios. Solo menciona los que estan en el catalogo. Si el cliente pregunta por algo que no ofreces, responde amablemente que no lo tienes.
- NUNCA incluyas IDs, UUIDs ni el "MAPEO PARA generate_payment_link" en tus respuestas al cliente. El cliente solo debe ver nombres de productos y precios.

INSTRUCCIONES POR INDUSTRIA:
${industryInstructions}

${behaviorInstructions.trim()}

${mcpInstructions}

${contactInstructions}`;
}

function buildCatalogSection(products: Product[], businessType: string): string {
  if (products.length === 0) {
    const emptyLabel: Record<string, string> = {
      products: "No hay productos disponibles en este momento.",
      services: "No hay servicios disponibles en este momento.",
      professional: "No hay informacion de servicios configurada.",
      mixed: "No hay items disponibles en este momento.",
    };
    return `CATALOGO:\n${emptyLabel[businessType] || emptyLabel.mixed}`;
  }

  const headerLabel: Record<string, string> = {
    products: "CATALOGO DE PRODUCTOS",
    services: "SERVICIOS DISPONIBLES",
    professional: "AREAS DE ATENCION",
    mixed: "CATALOGO",
  };

  const lines = products.map((p) => {
    const typeTag = p.item_type === "service" ? "[Servicio]" : p.item_type === "info" ? "[Info]" : "[Producto]";
    const priceStr = p.item_type !== "info" && Number(p.price) > 0
      ? ` | Precio: $${Number(p.price).toLocaleString("es-CL")}`
      : "";

    const unitLabel = p.unit_label?.trim() || "unidad";
    const stockStr = p.item_type === "product"
      ? ` | Stock: ${p.stock} ${unitLabel}${p.stock === 1 ? "" : "es"}`
      : p.item_type === "service"
        ? businessType === "services" || businessType === "professional"
          ? " | Requiere verificacion de agenda/fechas"
          : p.stock > 0
            ? ` | Disponibilidad: ${p.stock} ${unitLabel}${p.stock === 1 ? "" : "es"}`
            : " | Sin disponibilidad por ahora"
        : "";

    const descStr = p.description ? ` | ${p.description}` : "";
    return `- ${typeTag} ${p.name}${priceStr}${stockStr}${descStr}`;
  });

  const catalogText = `${headerLabel[businessType] || headerLabel.mixed}:\n${lines.join("\n")}`;
  const idMapping = products.length > 0
    ? `\n\nMAPEO PARA generate_payment_link (NUNCA incluir en respuestas al cliente):\n${products.map((p) => `"${p.name}" -> ${p.id}`).join("\n")}`
    : "";
  return catalogText + idMapping;
}

function buildToneInstructions(tone: string): string {
  switch (tone) {
    case "formal":
      return "- Trata al cliente de usted.\n- No uses emojis.\n- Lenguaje corporativo, respetuoso y profesional.";
    case "informal":
      return "- Tutea al cliente.\n- Puedes usar emojis con moderacion.\n- Lenguaje casual y cercano.";
    case "amigable":
    default:
      return "- Equilibrio entre profesional y cercano.\n- Puedes usar emojis ocasionalmente.\n- Tono calido pero respetuoso.";
  }
}

function buildContactInstructions(tenant: Tenant): string {
  const contactAction = tenant.contact_action || "payment_link";
  const isServicesBusiness = tenant.business_type === "services";
  const servicesRules = isServicesBusiness
    ? `

REGLAS PARA RESERVAS (SERVICIOS):
- Antes de confirmar precio o disponibilidad, solicita los datos necesarios (fecha, horario, cantidad de personas u otros segun el servicio).
- Si el cliente dice "quiero reservar", pregunta lo que falte para poder ayudarle.`
    : "";

  switch (contactAction) {
    case "whatsapp_contact": {
      const wa = tenant.contact_whatsapp || "";
      const waClean = wa.replace(/[^0-9]/g, "");
      return `CUANDO EL CLIENTE QUIERA COMPRAR/RESERVAR/CONTRATAR:
- Proporciona toda la informacion relevante del catalogo.
- Indica al cliente que para concretar, puede contactar directamente por WhatsApp: https://wa.me/${waClean}
- NO generes links de pago ni menciones sistemas de pago automaticos.${servicesRules}`;
    }
    case "email_contact": {
      const email = tenant.contact_email || "";
      return `CUANDO EL CLIENTE QUIERA COMPRAR/RESERVAR/CONTRATAR:
- Proporciona toda la informacion relevante del catalogo.
- Indica al cliente que para concretar, puede escribir a: ${email}
- NO generes links de pago ni menciones sistemas de pago automaticos.${servicesRules}`;
    }
    case "custom_message": {
      const msg = tenant.contact_custom_message || "Contacta directamente al negocio para mas informacion.";
      return `CUANDO EL CLIENTE QUIERA COMPRAR/RESERVAR/CONTRATAR:
- Proporciona toda la informacion relevante del catalogo.
- Responde con este mensaje de contacto: ${msg}
- NO generes links de pago ni menciones sistemas de pago automaticos.${servicesRules}`;
    }
    case "payment_link":
    default: {
      const usePaymentTool =
        (tenant.plan_tier === "pro" || tenant.plan_tier === "enterprise") &&
        !!tenant.mp_access_token;

      if (usePaymentTool) {
        return `METODO DE PAGO (AUTOMATICO):
Cuando un cliente quiera comprar:
1. Confirma que producto/servicio quiere y la cantidad.
2. Verifica stock/disponibilidad.
3. Llama a la funcion "generate_payment_link" con el product_id correspondiente.
4. El sistema generara automaticamente un link de pago seguro.
- SIEMPRE usa la funcion generate_payment_link, no inventes URLs.
- Si no hay stock, informa amablemente y ofrece alternativas.${servicesRules}`;
      }

      const bankDetails =
        tenant.bank_details?.trim() ||
        "Datos bancarios no configurados. Indica al cliente que contacte directamente al negocio para concretar el pago.";

      return `METODO DE PAGO (TRANSFERENCIA BANCARIA):
Los links de pago automaticos NO estan disponibles. Tu UNICA opcion es compartir los datos de transferencia.

Cuando un cliente quiera comprar, pagar, reservar, o pida "datos de transferencia", "transferir", "datos bancarios":
- INCLUYE SIEMPRE los datos completos en tu respuesta. Es obligatorio.
- NUNCA digas que no puedes proporcionarlos.
- NO los resumas ni omitas.

DATOS DE TRANSFERENCIA (copiar integramente en tu respuesta):
${bankDetails}

- Indica al cliente que envie el comprobante por este mismo chat o WhatsApp.
- NO ofrezcas links de pago ni menciones Mercado Pago (no esta disponible).${servicesRules}`;
    }
  }
}

// ============================================================
// Tools
// ============================================================
const generatePaymentLinkTool: AITool = {
  name: "generate_payment_link",
  description:
    "Genera un link de pago de Mercado Pago para que el cliente pueda pagar de forma segura. Usalo cuando el cliente confirme que quiere comprar. Usa product_id del MAPEO (nunca lo muestres al cliente) o product_name si prefieres.",
  parameters: {
    type: "object",
    properties: {
      product_id: {
        type: "string",
        description: "UUID del producto (del MAPEO en el catalogo). Usar este si lo tienes.",
      },
      product_name: {
        type: "string",
        description: "Nombre exacto del producto (alternativa a product_id). Usar si no tienes el ID.",
      },
      quantity: {
        type: "number",
        description: "Cantidad de unidades a comprar",
        default: 1,
      },
    },
  },
};

const captureContactDataTool: AITool = {
  name: "capture_contact_data",
  description: "Guarda datos del cliente cuando los mencione en la conversacion.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre del cliente si lo menciono" },
      email: { type: "string", description: "Email si lo proporciono" },
      phone: { type: "string", description: "Telefono si lo dio" },
      intent: {
        type: "string",
        enum: ["buying", "browsing", "support"],
      },
    },
  },
};

// ============================================================
// Tool executors
// ============================================================
async function executeGeneratePaymentLink(
  args: { product_id?: string; product_name?: string; quantity?: number },
  tenant: Tenant,
  products: Product[]
): Promise<{ link: string; product_name: string; product_id: string } | { error: string }> {
  let product: Product | undefined;
  if (args.product_id) {
    product = products.find((p) => p.id === args.product_id);
  }
  if (!product && args.product_name) {
    const nameLower = args.product_name.trim().toLowerCase();
    product = products.find((p) => p.name.toLowerCase() === nameLower)
      ?? products.find((p) => p.name.toLowerCase().includes(nameLower) || nameLower.includes(p.name.toLowerCase()));
  }

  if (!product) {
    return { error: "Producto no encontrado en el catalogo." };
  }

  const quantity = args.quantity || 1;

  if (product.stock < quantity) {
    return {
      error: `Solo hay ${product.stock} unidades disponibles de "${product.name}".`,
    };
  }

  if (!tenant.mp_access_token) {
    return { error: "El sistema de pagos no esta configurado aun." };
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
        notification_url: `${appUrl}/api/webhooks/payment?tenant_id=${tenant.id}`,
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
      product_id: product.id,
    };
  } catch (error) {
    console.error("[AI Service] Error generando preferencia MP:", error);
    return { error: "No se pudo generar el link de pago. Intenta mas tarde." };
  }
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function normalizePhone(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const normalized = phone.replace(/[^0-9+]/g, "").trim();
  return normalized || null;
}

function tagsFromContactIntent(intent?: CaptureContactPayload["intent"]): string[] {
  if (intent === "buying") return ["interesado"];
  if (intent === "support") return ["soporte"];
  if (intent === "browsing") return ["navegando"];
  return [];
}

function tagFromDetectedIntent(intent: BotResponse["intent_detected"]): string | null {
  if (intent === "purchase_intent") return "pregunto_precio";
  if (intent === "complaint") return "soporte";
  if (intent === "inquiry") return "navegando";
  return null;
}

async function executeCaptureContactData(params: {
  tenantId: string;
  channel: string;
  identifier?: string;
  payload: CaptureContactPayload;
}): Promise<{ ok: boolean; contactId?: string; reason?: string }> {
  if (!params.identifier) {
    return { ok: false, reason: "missing_identifier" };
  }

  const name = typeof params.payload.name === "string" ? params.payload.name.trim().slice(0, 120) : null;
  const email = normalizeEmail(params.payload.email);
  const phone = normalizePhone(params.payload.phone);

  if (!name && !email && !phone && !params.payload.intent) {
    return { ok: false, reason: "no_data" };
  }

  try {
    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, tags, metadata")
      .eq("tenant_id", params.tenantId)
      .eq("channel", params.channel)
      .eq("identifier", params.identifier)
      .maybeSingle();

    let canonicalContactId: string | null = null;
    if (phone || email) {
      let query = supabase
        .from("contacts")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .limit(1);
      if (existing?.id) query = query.neq("id", existing.id);
      if (phone) query = query.eq("phone", phone);
      else if (email) query = query.eq("email", email);
      const { data: match } = await query.maybeSingle();
      if (match?.id) canonicalContactId = match.id;
    }

    const metadata: Record<string, unknown> = {
      ...(existing?.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {}),
    };
    if (params.payload.intent) metadata.last_intent = params.payload.intent;

    const existingTags = Array.isArray(existing?.tags)
      ? existing!.tags.filter((t): t is string => typeof t === "string" && !!t.trim())
      : [];
    const mergedTags = Array.from(
      new Set([...existingTags, ...tagsFromContactIntent(params.payload.intent)].map((t) => t.toLowerCase()))
    ).slice(0, 20);

    const upsertData: Record<string, unknown> = {
      id: existing?.id,
      tenant_id: params.tenantId,
      channel: params.channel,
      identifier: params.identifier,
      name,
      email,
      phone,
      tags: mergedTags,
      metadata,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (canonicalContactId) {
      upsertData.canonical_contact_id = canonicalContactId;
    }

    const { data, error } = await supabase
      .from("contacts")
      .upsert(upsertData, { onConflict: "tenant_id,channel,identifier" })
      .select("id")
      .single();

    if (error) {
      console.warn("[AI Service] capture_contact_data failed:", error.message);
      return { ok: false, reason: error.message };
    }

    // Round 3: Send welcome email if email is present
    if (email) {
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("business_name")
        .eq("id", params.tenantId)
        .single();

      if (tenantData?.business_name) {
        // Ejecutamos en segundo plano para no bloquear al bot
        sendWelcomeEmail(email, tenantData.business_name).catch((err: any) =>
          console.error("[AI Service] Error sending welcome mail:", err)
        );
      }
    }

    return { ok: true, contactId: data?.id as string | undefined };
  } catch (error) {
    console.warn("[AI Service] capture_contact_data exception:", error);
    return { ok: false, reason: "exception" };
  }
}

async function upsertContactIntentTag(params: {
  tenantId: string;
  channel: string;
  identifier?: string;
  intent: BotResponse["intent_detected"];
}): Promise<void> {
  if (!params.identifier) return;
  const tag = tagFromDetectedIntent(params.intent);
  if (!tag) return;

  try {
    const supabase = createServiceClient();
    const { data: existing, error } = await supabase
      .from("contacts")
      .select("id, tags, metadata")
      .eq("tenant_id", params.tenantId)
      .eq("channel", params.channel)
      .eq("identifier", params.identifier)
      .maybeSingle();

    if (error || !existing) return;

    const tags = Array.from(
      new Set([
        ...(Array.isArray(existing.tags) ? existing.tags : []),
        tag,
      ]
        .filter((value): value is string => typeof value === "string" && !!value.trim())
        .map((value) => value.toLowerCase()))
    ).slice(0, 20);

    const metadata = {
      ...(existing.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {}),
      last_intent_detected: params.intent,
    };

    await supabase
      .from("contacts")
      .update({
        tags,
        metadata,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("tenant_id", params.tenantId);
  } catch (error) {
    console.warn("[AI Service] upsertContactIntentTag exception:", error);
  }
}

async function upsertConversationMemory(params: {
  tenantId: string;
  sessionId?: string;
  contactId?: string;
  userMessage: string;
  botMessage: string;
  intent?: BotResponse["intent_detected"];
}): Promise<void> {
  if (!params.sessionId) return;

  try {
    const supabase = createServiceClient();
    const { data: existing, error: readError } = await supabase
      .from("conversation_memory")
      .select("id, messages, context")
      .eq("tenant_id", params.tenantId)
      .eq("session_id", params.sessionId)
      .single();

    if (readError && readError.code !== "PGRST116") {
      console.warn("[AI Service] conversation_memory read failed:", readError.message);
      return;
    }

    const previousMessages = Array.isArray(existing?.messages) ? existing.messages : [];
    const nextMessages = [
      ...previousMessages,
      { role: "user", content: params.userMessage, ts: new Date().toISOString() },
      { role: "assistant", content: params.botMessage, ts: new Date().toISOString() },
    ].slice(-40);

    const nextContext: Record<string, unknown> = {
      ...(existing?.context && typeof existing.context === "object" ? (existing.context as Record<string, unknown>) : {}),
    };

    if (params.intent) nextContext.last_intent_detected = params.intent;

    await supabase.from("conversation_memory").upsert(
      {
        id: existing?.id,
        tenant_id: params.tenantId,
        session_id: params.sessionId,
        contact_id: params.contactId || null,
        messages: nextMessages,
        context: nextContext,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,session_id" }
    );
  } catch (error) {
    console.warn("[AI Service] conversation_memory upsert exception:", error);
  }
}

// ============================================================
// Conversation history by session_id
// ============================================================
async function getChatHistory(
  tenantId: string,
  sessionId: string,
  limit: number
): Promise<AIMessage[]> {
  const supabase = createServiceClient();
  const rows = limit * 2;

  const { data } = await supabase
    .from("chat_logs")
    .select("user_message, bot_response")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(rows);

  if (!data || data.length === 0) return [];

  const history: AIMessage[] = [];
  for (const row of data) {
    history.push({ role: "user", content: row.user_message });
    history.push({ role: "assistant", content: row.bot_response });
  }
  return history;
}

// ============================================================
// MAIN FUNCTION: processMessage
// ============================================================
export async function processMessage(
  request: BotRequest
): Promise<BotResponse> {
  const { tenant_id } = request;
  const rawUserMessage = request.user_message;
  const sanitizedUserMessage = sanitizeUserInput(rawUserMessage) || "Hola";

  const { tenant, products, mcpServers } = await getTenantContext(tenant_id);

  if (tenant.saas_subscription_status === "inactive") {
    return {
      message:
        "El servicio no esta disponible en este momento. Por favor contacta al administrador.",
      intent_detected: "unknown",
    };
  }

  const systemPrompt = buildSystemPrompt(tenant, products, mcpServers);
  const usePaymentTools =
    (tenant.contact_action || "payment_link") === "payment_link" &&
    (tenant.plan_tier === "pro" || tenant.plan_tier === "enterprise") &&
    !!tenant.mp_access_token;

  const historyLimit = parseInt(
    process.env.AI_CHAT_HISTORY_LIMIT || "10",
    10
  );
  const historyLimitSafe = Math.min(Math.max(historyLimit, 1), 20);

  let chatHistory: AIMessage[] = [];
  if (request.session_id) {
    chatHistory = await getChatHistory(
      tenant_id,
      request.session_id,
      historyLimitSafe
    );
  }

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory,
    { role: "user", content: sanitizedUserMessage },
  ];

  const tools: AITool[] = [];
  if (usePaymentTools) tools.push(generatePaymentLinkTool);
  if (request.user_identifier || request.session_id) tools.push(captureContactDataTool);

  let aiResponse = await callAI(messages, tools.length > 0 ? tools : undefined);

  let paymentLink: string | undefined;
  let detectedProductId: string | undefined;
  let capturedContactId: string | undefined;

  if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
    for (const toolCall of aiResponse.toolCalls) {
      if (toolCall.name === "generate_payment_link") {
        const result = await executeGeneratePaymentLink(
          toolCall.arguments as { product_id?: string; product_name?: string; quantity?: number },
          tenant,
          products
        );

        let toolResultContent: string;

        if ("error" in result) {
          toolResultContent = `Error: ${result.error}`;
        } else {
          paymentLink = result.link;
          detectedProductId = result.product_id;
          toolResultContent = JSON.stringify({
            payment_link: result.link,
            product_name: result.product_name,
            message: "Link de pago generado exitosamente",
          });
        }

        aiResponse = await callAIWithToolResult(
          messages,
          aiResponse.provider,
          toolCall.id,
          toolCall.name,
          toolResultContent,
          undefined,
          aiResponse.modelUsed
        );
      }

      if (toolCall.name === "capture_contact_data") {
        const captureResult = await executeCaptureContactData({
          tenantId: tenant_id,
          channel: request.channel || "web",
          identifier: request.user_identifier || request.session_id,
          payload: toolCall.arguments as CaptureContactPayload,
        });

        if (captureResult.contactId) {
          capturedContactId = captureResult.contactId;
        }

        const toolResultContent = JSON.stringify({
          ok: captureResult.ok,
          reason: captureResult.reason,
          contact_id: captureResult.contactId,
        });

        aiResponse = await callAIWithToolResult(
          messages,
          aiResponse.provider,
          toolCall.id,
          toolCall.name,
          toolResultContent,
          undefined,
          aiResponse.modelUsed
        );
      }
    }
  }

  const intent = detectIntent(sanitizedUserMessage, paymentLink);
  const finalMessage = sanitizeBotResponse(aiResponse.content || "No pude procesar tu mensaje.");

  await saveChatLog({
    tenant_id,
    user_message: rawUserMessage,
    bot_response: finalMessage,
    intent_detected: intent,
    product_id: detectedProductId,
    payment_link: paymentLink,
    session_id: request.session_id,
    user_identifier: request.user_identifier,
    channel: request.channel || "web",
    tokens_used: aiResponse.tokensUsed,
  });

  await upsertContactIntentTag({
    tenantId: tenant_id,
    channel: request.channel || "web",
    identifier: request.user_identifier || request.session_id,
    intent,
  });

  await upsertConversationMemory({
    tenantId: tenant_id,
    sessionId: request.session_id,
    contactId: capturedContactId,
    userMessage: rawUserMessage,
    botMessage: finalMessage,
    intent,
  });

  if (intent === "purchase_intent") {
    void notifyN8n("purchase_intent", {
      tenant_id,
      channel: request.channel || "web",
      user_identifier: request.user_identifier || null,
      session_id: request.session_id || null,
      product_id: detectedProductId || null,
      payment_link: paymentLink || null,
      user_message: rawUserMessage,
    }, { tenantId: tenant_id });
  }

  if (intent === "complaint") {
    void sendOwnerNewMessageAlertEmail({
      tenantId: tenant_id,
      to: tenant.email,
      businessName: tenant.business_name || "Tu Negocio",
      channel: request.channel || "web",
      senderId: request.user_identifier || request.session_id || "Cliente",
      message: rawUserMessage,
    });
  }

  if (capturedContactId) {
    void notifyN8n("contact_captured", {
      tenant_id,
      contact_id: capturedContactId,
      channel: request.channel || "web",
      user_identifier: request.user_identifier || request.session_id || null,
    }, { tenantId: tenant_id });
  }

  return {
    message: finalMessage,
    payment_link: paymentLink,
    intent_detected: intent,
    product_id: detectedProductId,
  };
}

// ============================================================
// Helpers
// ============================================================
/** Elimina UUIDs y referencias internas que el modelo pueda filtrar al cliente */
function sanitizeBotResponse(text: string): string {
  if (!text?.trim()) return text;
  let out = text;
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "");
  out = out.replace(/\s*\(ID:\s*[^)]+\)/g, "");
  out = out.replace(/\s*\|?\s*ID:\s*[^\s|]+/g, "");
  return out.replace(/\n{3,}/g, "\n\n").replace(/\s{2,}/g, " ").trim();
}

function detectIntent(
  message: string,
  hasPaymentLink?: string
): BotResponse["intent_detected"] {
  if (hasPaymentLink) return "purchase_intent";

  const lower = message.toLowerCase();
  const purchaseKeywords = [
    "comprar",
    "quiero",
    "precio",
    "costo",
    "cuanto",
    "cuánto",
    "pagar",
    "llevar",
    "adquirir",
    "reservar",
    "reserva",
    "cotizar",
    "cotización",
    "cotizacion",
    "presupuesto",
    "agendar",
    "disponibilidad",
    "disponible",
    "contratar",
    "sena",
    "seña",
    "anticipo",
    "transferir",
    "transferencia",
  ];
  const greetingKeywords = ["hola", "buenos", "buen dia", "buenas", "saludos"];
  const complaintKeywords = ["problema", "queja", "mal", "error", "falla", "defecto", "roto", "no hay", "no encuentro", "no veo"];

  const hasPurchase = purchaseKeywords.some((k) => lower.includes(k));
  const hasGreeting = greetingKeywords.some((k) => lower.includes(k));
  const hasComplaint = complaintKeywords.some((k) => lower.includes(k));

  // "no veo X disponible" = queja/consulta, no intención de compra
  const noVeoDisponible = /\bno\s+veo\b|\bno\s+hay\b|\bno\s+encuentro\b/i.test(lower);
  const hasPurchaseOnly = hasPurchase && !noVeoDisponible;

  // Priority: purchase > complaint > greeting > inquiry
  if (hasPurchaseOnly) return "purchase_intent";
  if (hasComplaint) return "complaint";
  if (hasGreeting) return "greeting";

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
