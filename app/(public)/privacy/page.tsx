import Link from "next/link";
import { Bot, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Política de Privacidad",
    description:
        "Conoce cómo YD Social Ops protege y maneja tus datos personales.",
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-background">
            {/* Navbar */}
            <nav className="border-b sticky top-0 bg-background/80 backdrop-blur-sm z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <Bot className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="font-bold text-lg">YD Social Ops</span>
                    </Link>
                    <Link href="/">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Volver
                        </Button>
                    </Link>
                </div>
            </nav>

            <article className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 prose prose-gray dark:prose-invert max-w-none">
                <h1 className="text-3xl font-bold mb-2">Política de Privacidad</h1>
                <p className="text-muted-foreground text-sm mb-8">
                    Última actualización: Febrero 2026
                </p>

                <section className="space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            1. Información que recopilamos
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            En YD Social Ops recopilamos la siguiente información cuando usas
                            nuestro servicio:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                            <li>
                                <strong>Datos de cuenta:</strong> nombre, correo electrónico y
                                contraseña al registrarte.
                            </li>
                            <li>
                                <strong>Datos de negocio:</strong> nombre de tu negocio, tipo de
                                negocio, productos/servicios que ofreces y datos bancarios para
                                pagos.
                            </li>
                            <li>
                                <strong>Datos de integración:</strong> tokens de acceso de Meta
                                (Facebook, Instagram, WhatsApp) y Mercado Pago, almacenados de
                                forma cifrada con AES-256.
                            </li>
                            <li>
                                <strong>Conversaciones:</strong> historial de mensajes entre tu
                                bot y tus clientes para mejorar la calidad del servicio.
                            </li>
                            <li>
                                <strong>Datos de contactos:</strong> información de los clientes
                                que interactúan con tu bot (nombre, email, teléfono si lo
                                proporcionan).
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            2. Cómo usamos tu información
                        </h2>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                            <li>
                                Proveer y mantener el servicio de bot de ventas automatizado.
                            </li>
                            <li>
                                Procesar pagos a través de Mercado Pago (los fondos van directo
                                a tu cuenta, no intermediamos).
                            </li>
                            <li>
                                Enviar notificaciones sobre tu cuenta, mensajes de clientes y
                                reportes.
                            </li>
                            <li>Mejorar la calidad de las respuestas del bot con IA.</li>
                            <li>Generar estadísticas agregadas y anónimas del servicio.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            3. Protección de datos
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Tomamos la seguridad de tus datos muy en serio:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                            <li>
                                Los tokens de acceso de integraciones se almacenan{" "}
                                <strong>cifrados con AES-256</strong>.
                            </li>
                            <li>
                                Las comunicaciones se realizan sobre{" "}
                                <strong>HTTPS/TLS</strong>.
                            </li>
                            <li>
                                Los datos se almacenan en servidores seguros de Supabase con
                                políticas de Row Level Security (RLS).
                            </li>
                            <li>
                                Implementamos rate limiting para proteger contra abusos.
                            </li>
                            <li>Protección activa contra inyección de prompts en el bot.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            4. Compartición de datos
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            <strong>No vendemos ni compartimos tus datos personales</strong>{" "}
                            con terceros. Solo compartimos información con:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                            <li>
                                <strong>Meta (Facebook/Instagram/WhatsApp):</strong> necesario
                                para el funcionamiento de los canales de mensajería.
                            </li>
                            <li>
                                <strong>Mercado Pago:</strong> para procesar pagos de tus
                                clientes.
                            </li>
                            <li>
                                <strong>Proveedores de IA (OpenAI/Google):</strong> para generar
                                respuestas del bot. Los mensajes se envían sin información
                                personal identificable del tenant.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            5. Cookies y almacenamiento local
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Utilizamos cookies y almacenamiento local del navegador para:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                            <li>Mantener tu sesión iniciada en el dashboard.</li>
                            <li>
                                Recordar la sesión de chat en el widget web de tu sitio.
                            </li>
                            <li>
                                Almacenar nonces de seguridad temporales para OAuth.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">6. Tus derechos</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            De acuerdo con la legislación chilena (Ley 19.628) y normativas
                            internacionales, tienes derecho a:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                            <li>Acceder a tus datos personales almacenados.</li>
                            <li>Solicitar la rectificación de datos incorrectos.</li>
                            <li>
                                Solicitar la eliminación de tus datos y tu cuenta.
                            </li>
                            <li>Exportar tus datos en formato portable (CSV).</li>
                            <li>Revocar el consentimiento de uso de datos.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            7. Retención de datos
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Conservamos tus datos mientras mantengas una cuenta activa. Las
                            sesiones de conversación del bot expiran automáticamente después de
                            24 horas. Si eliminas tu cuenta, todos los datos asociados serán
                            eliminados en un plazo máximo de 30 días.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">8. Contacto</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Si tienes preguntas sobre esta política de privacidad o quieres
                            ejercer tus derechos, contáctanos en{" "}
                            <a
                                href="mailto:soporte@ydsocialops.com"
                                className="text-primary hover:underline"
                            >
                                soporte@ydsocialops.com
                            </a>
                            .
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            9. Cambios en esta política
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Podemos actualizar esta política ocasionalmente. Notificaremos
                            cambios significativos por email. Te recomendamos revisar esta
                            página periódicamente.
                        </p>
                    </div>
                </section>
            </article>

            {/* Footer */}
            <footer className="border-t py-8">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        <span>YD Social Ops © 2026</span>
                    </div>
                    <div className="flex gap-4">
                        <Link
                            href="/pricing"
                            className="hover:text-foreground transition-colors"
                        >
                            Precios
                        </Link>
                        <Link
                            href="/privacy"
                            className="hover:text-foreground transition-colors font-medium text-foreground"
                        >
                            Privacidad
                        </Link>
                        <Link
                            href="/terms"
                            className="hover:text-foreground transition-colors"
                        >
                            Términos
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
