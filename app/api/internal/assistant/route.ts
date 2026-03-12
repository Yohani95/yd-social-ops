import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext, createServiceClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai-providers";
import type { AIMessage } from "@/lib/ai-providers";

const SYSTEM_PROMPT = `Eres un asistente interno de YD Social Ops, un SaaS de atención al cliente omnicanal con IA.
Tu función es ayudar al USUARIO DE LA PLATAFORMA (dueño o equipo del negocio) a consultar información y entender la plataforma.

REGLAS CRÍTICAS — debes seguirlas siempre:
1. NUNCA inventes, supongas ni confirmes datos que no estén en el contexto provisto.
2. NUNCA digas que agendaste, cancelaste, actualizaste o realizaste ninguna acción. Solo puedes CONSULTAR y REPORTAR.
3. Si no tienes datos reales en el contexto, di exactamente eso: "No tengo datos disponibles sobre esto en este momento."
4. Si el usuario quiere AGENDAR o CANCELAR una cita, explícale que eso lo hace el bot de atención al cliente desde los canales (WhatsApp, Messenger, etc.) o desde el Inbox.
5. No eres un bot de ventas. No ofrezcas planes ni servicios del SaaS.

Puedes ayudar con:
- Reportar datos reales del contexto: estado de integraciones, productos con stock bajo, configuración activa.
- Responder dudas sobre las funciones de la plataforma: inbox, bot, canales, feature flags, campañas, workflows, etc.
- Explicar cómo configurar integraciones (Calendly, WooCommerce, Shopify, Meta, n8n, etc.)
- Interpretar métricas de calidad del bot cuando haya datos disponibles.

Responde siempre en español, de forma concisa y directa.`;

/**
 * POST /api/internal/assistant
 *
 * Asistente interno para usuarios de la plataforma (Enterprise).
 * Contexto enriquecido con datos reales de citas y stock.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { message, history = [] } = body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const contextParts: string[] = [];

  // --- Contexto: próximas citas ---
  const msgLower = message.toLowerCase();
  if (/cita|agenda|calendario|horario|turno|disponib/i.test(msgLower)) {
    try {
      const { data: schedConf } = await supabase
        .from("tenant_scheduling_configs")
        .select("provider, is_active, event_type_uri")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true)
        .maybeSingle();

      if (schedConf) {
        contextParts.push(
          `Integración de agendamiento activa: ${schedConf.provider}. ` +
          (schedConf.event_type_uri
            ? `Event type URI configurado: ${schedConf.event_type_uri}.`
            : "Sin event_type_uri configurado — el tenant debe configurar el tipo de evento en Settings > Integraciones > Calendly para activar el agendamiento del bot.")
        );
      } else {
        contextParts.push("No hay integración de agendamiento activa para este tenant. El tenant debe conectar Calendly en Settings > Integraciones.");
      }
    } catch {
      // ignorar
    }
  }

  // --- Contexto: productos con stock bajo ---
  if (/stock|producto|inventario|poco|agotado|disponible/i.test(msgLower)) {
    try {
      const { data: lowStock } = await supabase
        .from("products")
        .select("name, stock_quantity, price")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true)
        .lt("stock_quantity", 5)
        .order("stock_quantity", { ascending: true })
        .limit(10);

      if (lowStock && lowStock.length > 0) {
        const lines = lowStock.map(
          (p) => `• ${p.name}: ${p.stock_quantity ?? 0} unidades ($ ${p.price ?? 0})`
        );
        contextParts.push(`Productos con stock bajo (< 5 unidades):\n${lines.join("\n")}`);
      } else {
        contextParts.push("No hay productos con stock bajo registrados.");
      }
    } catch {
      // ignorar
    }
  }

  // --- Contexto: métricas de calidad del bot ---
  if (/calidad|bot|metrica|satisfacc|rendimiento/i.test(msgLower)) {
    try {
      const { data: quality } = await supabase
        .from("bot_quality_events")
        .select("score, feedback_type, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (quality && quality.length > 0) {
        const avg = quality.reduce((s, q) => s + (q.score ?? 0), 0) / quality.length;
        contextParts.push(`Últimas ${quality.length} evaluaciones del bot — score promedio: ${avg.toFixed(1)}/10.`);
      }
    } catch {
      // ignorar
    }
  }

  // Construir mensajes para la IA
  const systemContent = contextParts.length > 0
    ? `${SYSTEM_PROMPT}\n\n--- DATOS EN TIEMPO REAL ---\n${contextParts.join("\n\n")}`
    : SYSTEM_PROMPT;

  const messages: AIMessage[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const result = await callAI(messages);
    return NextResponse.json({ reply: result.content });
  } catch (err) {
    console.error("[internal/assistant] AI error:", err);
    return NextResponse.json({ error: "Error del asistente" }, { status: 500 });
  }
}
