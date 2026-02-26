"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { callAIWithToolResult, callAI, type AIMessage, type AITool } from "@/lib/ai-providers";
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

        const systemPrompt = `Eres "Setup Assistant", el asistente de configuración interna para dueños de negocios en la plataforma YD Social Ops.
Tu objetivo es ayudar al usuario (el dueño) a configurar SU PROPIO bot y catálogo de manera rápida y amigable, con unas pocas preguntas.
NO ERES EL BOT DE VENTAS de sus clientes. Eres el experto que le ayuda a armarlo.

PROCESO DE SETUP:
1. Pregunta qué tipo de negocio tiene y su nombre comercial (si no lo sabes).
2. Pregúntale o pídele que pegue una lista de sus productos/servicios con sus precios. (Utiliza 'create_products_bulk' cuando te lo digan).
3. Pregunta cómo quiere que su bot actúe (tono) y su nombre. (Utiliza 'update_tenant_config').
4. Cuando el bot y el catálogo estén listos, dile al usuario que puede ir a la pestaña "Probar Bot" para ver los resultados.

Datos actuales del negocio (actualiza lo que falte):
- Nombre: ${tenantData.business_name || "No definido"}
- Tipo: ${tenantData.business_type || "No definido"}
- Bot Name: ${tenantData.bot_name || "No definido"}
- Tono: ${tenantData.bot_tone || "No definido"}
`;

        const nextHistory: AIMessage[] = [...chatHistory, { role: "user", content: userMessage }];
        const aiMessages: AIMessage[] = [{ role: "system", content: systemPrompt }, ...nextHistory];

        let aiResponse = await callAI(aiMessages, [updateTenantTool, createProductsTool]);

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
                    const toInsert = args.items.map(item => ({
                        ...item,
                        tenant_id: tenantId,
                        is_active: true
                    }));
                    const { error } = await supabase.from("products").insert(toInsert);
                    if (error) toolResultString = "Error al guardar productos: " + error.message;
                    else toolResultString = "Se insertaron " + toInsert.length + " productos en el catálogo de forma exitosa.";
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

        nextHistory.push({ role: "assistant", content: aiResponse.content || "Procedimiento completo." });

        return { message: aiResponse.content || "¡Listo!", newHistory: nextHistory };
    } catch (error: any) {
        console.error("[Setup Assistant] Error:", error);
        return { message: "Lo siento, ocurrió un error procesando la configuración.", newHistory: chatHistory };
    }
}
