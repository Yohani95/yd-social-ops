"use server";

import { getAuthenticatedContext } from "@/lib/supabase/server";
import { callAI, type AIMessage, type AITool } from "@/lib/ai-providers";
import { completeSetupWizard } from "./setup";
import type { ActionResult, BotTone, BusinessType, ContactAction, ProductCreate } from "@/types";

const SETUP_TOOLS: AITool[] = [
    {
        name: "update_setup_config",
        description: "Actualiza la configuración del negocio y del bot. Puedes usarlo para guardar el nombre del negocio, tipo, descripción, contacto y configuración del bot.",
        parameters: {
            type: "object",
            properties: {
                business_name: { type: "string" },
                business_type: { type: "string", enum: ["products", "services", "professional", "mixed"] },
                business_description: { type: "string" },
                contact_action: { type: "string", enum: ["payment_link", "whatsapp_contact", "email_contact", "custom_message"] },
                contact_whatsapp: { type: "string" },
                contact_email: { type: "string" },
                contact_custom_message: { type: "string" },
                bot_name: { type: "string" },
                bot_tone: { type: "string", enum: ["formal", "amigable", "informal"] },
                bot_welcome_message: { type: "string" },
            },
        },
    },
    {
        name: "create_products_bulk",
        description: "Crea uno o varios productos/servicios en el catálogo del negocio.",
        parameters: {
            type: "object",
            properties: {
                products: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            description: { type: "string" },
                            price: { type: "number" },
                            stock: { type: "number" },
                            item_type: { type: "string", enum: ["product", "service", "info"] },
                            unit_label: { type: "string" },
                            availability_type: { type: "string", enum: ["stock", "calendar", "quota"] },
                        },
                        required: ["name", "price"],
                    },
                },
            },
            required: ["products"],
        },
    },
];

export async function processSetupChatMessage(messages: AIMessage[]): Promise<{
    message: string;
    toolResults?: any[];
}> {
    const ctx = await getAuthenticatedContext();
    if (!ctx) throw new Error("No autenticado");

    const systemPrompt = `Eres el "Asistente de Configuración de YD Social Ops". 
Tu objetivo es ayudar al usuario a configurar su negocio en la plataforma de forma amigable y eficiente.

PASOS DE CONFIGURACIÓN QUE DEBES CUBRIR:
1. Nombre y tipo de negocio (productos, servicios, profesional, mixto).
2. Catálogo: Pregunta qué productos o servicios ofrece.
3. Método de contacto: Cómo quiere cerrar las ventas (Mercado Pago, WhatsApp, etc).
4. Personalidad del bot: Nombre y tono.

REGLAS:
- Sé proactivo. Si el usuario te da información, usa las herramientas para guardarla de inmediato.
- Si el usuario menciona varios productos, usa 'create_products_bulk'.
- Si el usuario menciona el nombre de su empresa, usa 'update_setup_config'.
- Mantén un tono profesional pero cercano, como un consultor de onboarding.
- Al final de cada paso importante, confirma que has guardado la información.
- Si ya tienes suficiente información para terminar, invita al usuario a ir al simulador.

DATOS ACTUALES DEL NEGOCIO:
Tenant ID: ${ctx.tenantId}
`;

    const aiMessages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages,
    ];

    const response = await callAI(aiMessages, SETUP_TOOLS);

    if (response.toolCalls && response.toolCalls.length > 0) {
        const results = [];
        for (const toolCall of response.toolCalls) {
            if (toolCall.name === "update_setup_config") {
                const args = toolCall.arguments as any;
                const res = await completeSetupWizard({
                    business_name: args.business_name || "",
                    business_type: args.business_type as BusinessType,
                    business_description: args.business_description,
                    contact_action: args.contact_action as ContactAction,
                    contact_whatsapp: args.contact_whatsapp,
                    contact_email: args.contact_email,
                    contact_custom_message: args.contact_custom_message,
                    bot_name: args.bot_name || "Asistente",
                    bot_tone: args.bot_tone as BotTone,
                    bot_welcome_message: args.bot_welcome_message || "Hola",
                });
                results.push({ name: toolCall.name, success: res.success, data: res.data });
            } else if (toolCall.name === "create_products_bulk") {
                const args = toolCall.arguments as { products: ProductCreate[] };
                const res = await completeSetupWizard({
                    business_name: "", // Solo productos
                    business_type: "products",
                    contact_action: "payment_link",
                    bot_name: "Asistente",
                    bot_tone: "amigable",
                    bot_welcome_message: "Hola",
                    products: args.products,
                });
                results.push({ name: toolCall.name, success: res.success, data: res.data });
            }
        }

        // Volvemos a llamar a la AI con los resultados para que confirme al usuario
        const finalMessages: AIMessage[] = [
            ...aiMessages,
            { role: "assistant", content: response.content, tool_calls: response.toolCalls } as any,
            ...results.map(r => ({
                role: "tool",
                tool_call_id: response.toolCalls![0].id, // Simplificado para este MVP
                name: r.name,
                content: JSON.stringify(r),
            })) as any
        ];

        const finalResponse = await callAI(finalMessages);
        return { message: finalResponse.content, toolResults: results };
    }

    return { message: response.content };
}
