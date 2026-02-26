import Link from "next/link";
import { Bot, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Términos de Servicio",
    description:
        "Términos y condiciones de uso de la plataforma YD Social Ops.",
};

export default function TermsPage() {
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
                <h1 className="text-3xl font-bold mb-2">Términos de Servicio</h1>
                <p className="text-muted-foreground text-sm mb-8">
                    Última actualización: Febrero 2026
                </p>

                <section className="space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            1. Aceptación de los términos
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Al crear una cuenta en YD Social Ops, acceder o utilizar nuestro
                            servicio, aceptas estos términos de servicio en su totalidad. Si no
                            estás de acuerdo con alguna parte, no debes utilizar la plataforma.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            2. Descripción del servicio
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            YD Social Ops es una plataforma SaaS que permite a negocios crear
                            bots de ventas impulsados por inteligencia artificial para atender
                            clientes en múltiples canales (web, WhatsApp, Instagram, Messenger,
                            TikTok) y generar links de pago automáticos mediante Mercado Pago.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">3. Cuentas de usuario</h2>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                            <li>
                                Debes proporcionar información veraz y actualizada al
                                registrarte.
                            </li>
                            <li>
                                Eres responsable de mantener la confidencialidad de tu
                                contraseña.
                            </li>
                            <li>
                                Debes notificarnos inmediatamente cualquier uso no autorizado de
                                tu cuenta.
                            </li>
                            <li>
                                Un usuario puede administrar un solo tenant (negocio) por cuenta.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            4. Planes y pagos
                        </h2>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                            <li>
                                Ofrecemos un <strong>período de prueba de 14 días</strong> sin
                                requerir tarjeta de crédito.
                            </li>
                            <li>
                                Los planes se facturan mensualmente en{" "}
                                <strong>pesos chilenos (CLP)</strong> a través de Mercado Pago.
                            </li>
                            <li>
                                Puedes cambiar de plan (upgrade o downgrade) en cualquier
                                momento.
                            </li>
                            <li>
                                Los pagos de tus clientes van{" "}
                                <strong>directo a tu cuenta de Mercado Pago</strong>. YD Social
                                Ops no intermedia ni retiene los fondos de tus ventas.
                            </li>
                            <li>
                                Nos reservamos el derecho de modificar los precios con aviso
                                previo de 30 días.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            5. Uso aceptable
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Te comprometes a no utilizar YD Social Ops para:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                            <li>
                                Actividades ilegales, fraudulentas o que violen los derechos de
                                terceros.
                            </li>
                            <li>
                                Enviar spam, mensajes no solicitados o contenido ofensivo a
                                través del bot.
                            </li>
                            <li>
                                Intentar acceder a datos de otros tenants o vulnerar la
                                seguridad de la plataforma.
                            </li>
                            <li>
                                Vender productos o servicios prohibidos por la ley chilena o las
                                políticas de Mercado Pago.
                            </li>
                            <li>
                                Manipular o intentar inyectar instrucciones maliciosas en el
                                sistema de IA.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            6. Integraciones con terceros
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            YD Social Ops se integra con servicios de terceros (Meta, Mercado
                            Pago, proveedores de IA). Estas integraciones están sujetas a los
                            términos de servicio de cada plataforma. No somos responsables de
                            cambios en las APIs, interrupciones o limitaciones impuestas por
                            estos terceros.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            7. Propiedad intelectual
                        </h2>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                            <li>
                                YD Social Ops y su tecnología son propiedad de sus
                                desarrolladores.
                            </li>
                            <li>
                                Tus datos, productos y contenido de negocio{" "}
                                <strong>te pertenecen a ti</strong>.
                            </li>
                            <li>
                                Nos otorgas una licencia limitada para procesar tus datos con el
                                fin de proveer el servicio.
                            </li>
                            <li>
                                Al cancelar tu cuenta, puedes exportar tus datos antes de la
                                eliminación.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            8. Disponibilidad del servicio
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Nos esforzamos por mantener el servicio disponible 24/7. Sin
                            embargo, no garantizamos una disponibilidad del 100%. Pueden
                            ocurrir interrupciones por mantenimiento, actualizaciones o
                            factores fuera de nuestro control. Los planes Enterprise incluyen
                            SLA con compromisos de disponibilidad específicos.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            9. Limitación de responsabilidad
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            YD Social Ops se provee &quot;tal cual&quot;. No somos responsables
                            de pérdidas de ventas, daños indirectos o consecuentes derivados del
                            uso o imposibilidad de uso del servicio. Nuestra responsabilidad
                            máxima está limitada al monto pagado por el servicio en los últimos
                            3 meses.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            10. Cancelación y terminación
                        </h2>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                            <li>
                                Puedes cancelar tu suscripción en cualquier momento desde el
                                dashboard.
                            </li>
                            <li>
                                Al cancelar, tu cuenta permanece activa hasta el fin del período
                                pagado.
                            </li>
                            <li>
                                Nos reservamos el derecho de suspender cuentas que violen estos
                                términos.
                            </li>
                            <li>
                                Tras la eliminación de la cuenta, tus datos serán borrados en un
                                plazo de 30 días.
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            11. Legislación aplicable
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Estos términos se rigen por las leyes de la República de Chile.
                            Cualquier controversia será resuelta ante los tribunales ordinarios
                            de justicia competentes.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">
                            12. Cambios en los términos
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Podemos modificar estos términos en cualquier momento.
                            Notificaremos cambios significativos por email con al menos 15 días
                            de anticipación. El uso continuado del servicio después de los
                            cambios constituye aceptación de los nuevos términos.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-3">13. Contacto</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Para consultas sobre estos términos, contáctanos en{" "}
                            <a
                                href="mailto:soporte@ydsocialops.com"
                                className="text-primary hover:underline"
                            >
                                soporte@ydsocialops.com
                            </a>
                            .
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
                            className="hover:text-foreground transition-colors"
                        >
                            Privacidad
                        </Link>
                        <Link
                            href="/terms"
                            className="hover:text-foreground transition-colors font-medium text-foreground"
                        >
                            Términos
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
