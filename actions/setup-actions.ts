"use server";

import { createServiceClient } from "@/lib/supabase/server";

/** Elimina fugas de sintaxis interna (funciones, JSON) que el modelo pueda mostrar al usuario */
function sanitizeAssistantResponse(text: string): string {
    let out = text;
    out = out.replace(/<function[^>]*>[\s\S]*?<\/function>/gi, "");
    out = out.replace(/\{\s*"(?:business_name|bot_name|bot_tone|bot_welcome_message|business_type|items|delete_all)"[\s\S]*?\}/g, "");
    out = out.replace(/\b(?:update_tenant_config|create_products_bulk|delete_products_bulk)\b/gi, "");
    out = out.replace(/\s+con la función\s*\./gi, ".");
    out = out.replace(/\s+con la función\s*,/gi, ",");
    return out.replace(/\n{3,}/g, "\n\n").replace(/\s{2,}/g, " ").trim() || "Listo.";
}
import { callAIWithToolResult, callAI, type AIMessage, type AITool } from "@/lib/ai-providers";
import { getAppUrl } from "@/lib/app-url";
import type { Tenant, Product } from "@/types";

const updateTenantTool: AITool = {
    name: "update_tenant_config",
    description: "Actualiza la configuración central del negocio (nombre, tipo, mensaje de bienvenida, etc).",
    parameters: {
        type: "object",
        properties: {
            business_name: { type: "string" },
            business_type: { type: "string", enum: ["products", "services", "professional"] },
            bot_name: { type: "string" },
            bot_welcome_message: { type: "string" },
            bot_tone: { type: "string", enum: ["amigable", "formal", "informal"] },
            contact_action: { type: "string", enum: ["payment_link", "whatsapp_contact", "email_contact"] },
        }
    }
};

const createProductsTool: AITool = {
    name: "create_products_bulk",
    description: "Añade múltiples productos o servicios al catálogo del negocio a partir de la descripción del usuario.",
    parameters: {
        type: "object",
        properties: {
            items: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Nombre del servicio/producto" },
                        price: { type: "number", description: "Precio (sólo números, 0 si no hay)" },
                        description: { type: "string" },
                        item_type: { type: "string", enum: ["product", "service", "info"] },
                        stock: { type: "number", default: 1 },
                    },
                    required: ["name", "price", "item_type"]
                }
            }
        },
        required: ["items"]
    }
};

const deleteProductsTool: AITool = {
    name: "delete_products_bulk",
    description: "Elimina todos los productos del catálogo del negocio. Usar cuando el usuario pida borrar, eliminar o vaciar sus productos.",
    parameters: {
        type: "object",
        properties: {
            delete_all: { type: "boolean", description: "Debe ser true para confirmar la eliminación de todos los productos" }
        },
        required: ["delete_all"]
    }
};

export async function processSetupChat(
    tenantId: string,
    userMessage: string,
    chatHistory: AIMessage[]
): Promise<{ message: string; newHistory: AIMessage[] }> {
    try {
        const supabase = createServiceClient();

        // Obtenemos el Tenant para dar contexto inicial al bot de setup
        const { data: tenantData } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", tenantId)
            .single();

        if (!tenantData) {
            return { message: "Error interno: no se encontró tu cuenta.", newHistory: [] };
        }

        const channelsUrl = `${getAppUrl()}/dashboard/channels`;
        const productsUrl = `${getAppUrl()}/dashboard/products`;

        const systemPrompt = `Eres "Setup Assistant", el asistente de configuración para dueños de negocios en YD Social Ops.
Ayudas a configurar el bot y el catálogo. NO eres el bot de ventas de sus clientes.

IMPORTANTE: NUNCA muestres al usuario nombres de funciones, JSON, parámetros técnicos ni sintaxis como <function=...>. Responde SIEMPRE en lenguaje natural y amigable. Si vas a usar una herramienta, hazlo en silencio y luego explica el resultado con palabras simples.

HERRAMIENTAS DISPONIBLES (usa internamente, no las menciones al usuario):
- update_tenant_config: actualizar nombre del negocio, tipo, tono del bot, mensaje de bienvenida.
- create_products_bulk: añadir productos/servicios al catálogo (evita duplicados por nombre).
- delete_products_bulk: eliminar TODOS los productos del catálogo. Usa cuando pidan "borrar todos", "eliminar productos", "vaciar catálogo".

LO QUE NO PUEDES HACER:
- Conectar WhatsApp, Instagram o Messenger: eso se hace en la app. Si preguntan cómo conectar WhatsApp/canales, responde amablemente que deben ir a "Canales" en el menú del dashboard: ${channelsUrl} - ahí pueden conectar Meta (WhatsApp, Messenger, Instagram) con un clic. NO inventes pasos con tokens ni números.
- Editar productos uno por uno: para eso está la página de Productos: ${productsUrl}

RESPUESTAS CORRECTAS:
- "borra todos mis productos" → usa delete_products_bulk con delete_all: true.
- "cómo conecto WhatsApp" → "Ve a Canales en el menú del dashboard. Ahí puedes conectar WhatsApp, Instagram y Messenger con tu cuenta de Meta en pocos clic."
- "quiero productos" → pide la lista y usa create_products_bulk.

Datos actuales del negocio:
- Nombre: ${tenantData.business_name || "No definido"}
- Tipo: ${tenantData.business_type || "No definido"}
- Bot Name: ${tenantData.bot_name || "No definido"}
- Tono: ${tenantData.bot_tone || "No definido"}
`;

        const nextHistory: AIMessage[] = [...chatHistory, { role: "user", content: userMessage }];
        const aiMessages: AIMessage[] = [{ role: "system", content: systemPrompt }, ...nextHistory];

        let aiResponse = await callAI(aiMessages, [updateTenantTool, createProductsTool, deleteProductsTool]);

        if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
            for (const toolCall of aiResponse.toolCalls) {
                let toolResultString = "";

                if (toolCall.name === "update_tenant_config") {
                    const args = toolCall.arguments as Partial<Tenant>;
                    const { error } = await supabase.from("tenants").update(args).eq("id", tenantId);
                    if (error) toolResultString = "Error al guardar config: " + error.message;
                    else toolResultString = "Configuración del bot actualizada correctamente en la base de datos.";
                }
                else if (toolCall.name === "create_products_bulk") {
                    const args = toolCall.arguments as { items: Product[] };
                    const { data: existing } = await supabase
                        .from("products")
                        .select("name")
                        .eq("tenant_id", tenantId);
                    const existingNames = new Set(
                        (existing || []).map((p) => (p.name || "").toLowerCase().trim())
                    );
                    const toInsert = args.items
                        .map(item => ({
                            ...item,
                            tenant_id: tenantId,
                            is_active: true
                        }))
                        .filter(item => {
                            const name = (item.name || "").toLowerCase().trim();
                            if (!name) return false;
                            if (existingNames.has(name)) return false;
                            existingNames.add(name);
                            return true;
                        });
                    if (toInsert.length === 0) {
                        toolResultString = "No se añadieron productos nuevos: todos ya existían en el catálogo (evitando duplicados).";
                    } else {
                        const { error } = await supabase.from("products").insert(toInsert);
                        if (error) toolResultString = "Error al guardar productos: " + error.message;
                        else toolResultString = "Se insertaron " + toInsert.length + " producto(s) nuevo(s) en el catálogo. Los que ya existían fueron omitidos.";
                    }
                }
                else if (toolCall.name === "delete_products_bulk") {
                    const args = toolCall.arguments as { delete_all?: boolean };
                    if (args?.delete_all) {
                        const { data: deleted, error } = await supabase
                            .from("products")
                            .delete()
                            .eq("tenant_id", tenantId)
                            .select("id");
                        if (error) toolResultString = "Error al eliminar productos: " + error.message;
                        else toolResultString = "Se eliminaron " + (deleted?.length ?? 0) + " producto(s) del catálogo.";
                    } else {
                        toolResultString = "No se eliminó nada. Para borrar todos los productos, delete_all debe ser true.";
                    }
                }

                aiResponse = await callAIWithToolResult(
                    aiMessages,
                    aiResponse.provider,
                    toolCall.id,
                    toolCall.name,
                    toolResultString,
                    undefined,
                    aiResponse.modelUsed
                );
            }
        }

        const rawContent = aiResponse.content || "Procedimiento completo.";
        const sanitized = sanitizeAssistantResponse(rawContent);
        nextHistory.push({ role: "assistant", content: sanitized });

        return { message: sanitizeAssistantResponse(aiResponse.content || "¡Listo!"), newHistory: nextHistory };
    } catch (error: any) {
        console.error("[Setup Assistant] Error:", error);
        return { message: "Lo siento, ocurrió un error procesando la configuración.", newHistory: chatHistory };
    }
}
