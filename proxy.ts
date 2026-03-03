import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplicar middleware a todas las rutas excepto:
     * - _next/static (archivos estaticos)
     * - _next/image (optimizacion de imagenes)
     * - favicon.ico
     * - Archivos publicos
     * - API de bot (endpoint publico para el bot)
     * - API de webhooks/channels webhook (callbacks externos)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/bot|api/webhooks|api/channels/webhook).*)",
  ],
};
