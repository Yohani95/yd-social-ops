import { NextRequest, NextResponse } from "next/server";
import { processMessage } from "@/lib/ai-service";
import { checkAIRateLimit } from "@/lib/rate-limit";
import type { BotRequest } from "@/types";

/**
 * POST /api/bot/:tenant_id
 *
 * Endpoint público del bot de ventas.
 * No requiere autenticación (el bot es para clientes finales).
 * Integrar con WhatsApp Business API, Instagram, etc.
 *
 * Body: { message, session_id?, user_identifier?, channel? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  try {
    const { tenant_id } = await params;

    if (!tenant_id) {
      return NextResponse.json(
        { error: "tenant_id es requerido" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { message, session_id, user_identifier, channel } = body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return NextResponse.json(
        { error: "El campo 'message' es requerido y no puede estar vacío" },
        { status: 400 }
      );
    }

    // Límite opcional por minuto (evita superar cuota gratuita de la API de IA)
    const rateLimit = checkAIRateLimit(tenant_id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Demasiados mensajes por minuto. Intenta en un momento.",
          retry_after_seconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: rateLimit.retryAfterSeconds
            ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    const botRequest: BotRequest = {
      tenant_id,
      user_message: message.trim(),
      session_id: session_id || undefined,
      user_identifier: user_identifier || undefined,
      channel: channel || "web",
    };

    const response = await processMessage(botRequest);

    return NextResponse.json({
      success: true,
      ...response,
      // Compatibilidad temporal con clientes legacy del widget.
      bot_response: response.message,
    });
  } catch (error) {
    console.error("[Bot API] Error:", error);

    const message =
      error instanceof Error ? error.message : "Error interno del servidor";

    // No exponer detalles de error al cliente
    if (message.includes("Tenant no encontrado")) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Error procesando el mensaje. Intenta más tarde." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bot/:tenant_id
 * Health check del bot
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  const { tenant_id } = await params;
  return NextResponse.json({
    status: "ok",
    tenant_id,
    message: "Bot activo y listo para recibir mensajes",
  });
}
