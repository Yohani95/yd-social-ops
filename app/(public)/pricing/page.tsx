import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Zap,
  Crown,
  ArrowRight,
  Building2,
  Gem,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LandingNav } from "@/components/landing/landing-nav";
import { FAQSection } from "@/components/landing/faq-section";
import type { PlanInfo } from "@/types";

const plans: PlanInfo[] = [
  {
    id: "basic",
    name: "Básico",
    description: "Para vendedores que empiezan a automatizar",
    price: 9990,
    currency: "CLP",
    period: "mes",
    features: [
      { label: "Bot con IA en tu web", included: true },
      { label: "Responde consultas 24/7", included: true },
      { label: "Entrega datos bancarios automáticos", included: true },
      { label: "Gestión de inventario", included: true },
      { label: "Historial de conversaciones", included: true },
      { label: "Links de pago Mercado Pago", included: false },
      { label: "Integración redes sociales", included: false },
      { label: "Analytics avanzados", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Para negocios que quieren pago automático",
    price: 24990,
    currency: "CLP",
    period: "mes",
    highlighted: true,
    badge: "Más popular",
    features: [
      { label: "Todo lo del Plan Básico", included: true },
      { label: "Links de pago MP automáticos", included: true },
      { label: "Descuento de stock automático", included: true },
      { label: "OAuth con tu cuenta Mercado Pago", included: true },
      { label: "Múltiples productos en catálogo", included: true },
      { label: "Analytics de conversiones", included: true },
      { label: "Integración WhatsApp/Instagram", included: false },
      { label: "White-label", included: false },
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "Para negocios con alto volumen de ventas",
    price: 49990,
    currency: "CLP",
    period: "mes",
    badge: "Escalable",
    features: [
      { label: "Todo lo del Plan Pro", included: true },
      { label: "WhatsApp Business API", included: true },
      { label: "Instagram Messaging", included: true },
      { label: "Messenger (incluye Marketplace)", included: true },
      { label: "CRM avanzado con tags", included: true },
      { label: "Reportes semanales por email", included: true },
      { label: "Servidores MCP personalizados", included: true },
      { label: "White-label", included: false },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Para equipos que quieren escalar en todos los canales",
    price: 79990,
    currency: "CLP",
    period: "mes",
    features: [
      { label: "Todo lo del Plan Business", included: true },
      { label: "TikTok Business messaging", included: true },
      { label: "Múltiples usuarios (equipo)", included: true },
      { label: "Analytics consolidados", included: true },
      { label: "White-label (tu marca)", included: true },
      { label: "Dominio personalizado", included: true },
      { label: "Soporte prioritario", included: true },
    ],
  },
  {
    id: "enterprise_plus",
    name: "Enterprise+",
    description: "Solución a medida para grandes empresas",
    price: 199990,
    currency: "CLP",
    period: "mes",
    badge: "Premium",
    features: [
      { label: "Todo lo del Plan Enterprise", included: true },
      { label: "Onboarding personalizado", included: true },
      { label: "Entrenamiento del bot a medida", included: true },
      { label: "API dedicada", included: true },
      { label: "SLA con 99.9% uptime", included: true },
      { label: "Integraciones custom (ERP/CRM)", included: true },
      { label: "Account manager dedicado", included: true },
    ],
  },
];

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

const planIcons: Record<string, typeof Bot> = {
  basic: Bot,
  pro: Zap,
  business: Building2,
  enterprise: Crown,
  enterprise_plus: Gem,
};

export const metadata = {
  title: "Precios",
  description:
    "Planes desde $9.990 CLP/mes. Bot de ventas con IA, links de pago Mercado Pago, WhatsApp, Instagram y más. 14 días gratis.",
  openGraph: {
    title: "Precios — YD Social Ops",
    description:
      "Automatiza tus ventas desde $9.990 CLP/mes. 14 días de prueba gratis. Sin tarjeta de crédito.",
  },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />

      {/* Header */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-8 text-center">
        <Badge variant="secondary" className="mb-4">
          14 días de prueba gratis en todos los planes
        </Badge>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
          Precios simples y transparentes
        </h1>
        <p className="text-base sm:text-xl text-muted-foreground max-w-xl mx-auto">
          Elige el plan que mejor se adapte a tu negocio. Sin contratos.
          Cancela cuando quieras.
        </p>
      </section>

      {/* Plans Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {/* Mobile/tablet: 1-2 cols; Desktop: 3 cols first row + 2 centered second row; XL: 5 cols */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 items-stretch">
          {plans.map((plan) => {
            const Icon = planIcons[plan.id];
            const subscribePath = `/subscribe?plan=${plan.id}`;

            return (
              <Card
                key={plan.id}
                className={`flex flex-col relative ${
                  plan.highlighted
                    ? "border-primary shadow-lg shadow-primary/10"
                    : ""
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge
                      className="px-4 py-1 whitespace-nowrap"
                      variant={plan.highlighted ? "default" : "secondary"}
                    >
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4 pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        plan.highlighted
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs leading-snug">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">
                      {formatCLP(plan.price)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      /{plan.period}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.label}
                        className="flex items-center gap-2 text-sm"
                      >
                        {feature.included ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                        )}
                        <span
                          className={
                            feature.included ? "" : "text-muted-foreground/60"
                          }
                        >
                          {feature.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="pt-6">
                  <Link href={subscribePath} className="w-full">
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "default" : "outline"}
                      size="lg"
                    >
                      Suscribirse
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Note below grid for lg screens (3-col) */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Todos los precios en CLP e incluyen IVA. Facturación mensual.
        </p>
      </section>

      {/* FAQ */}
      <FAQSection />

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
        <div className="rounded-2xl bg-primary text-primary-foreground p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">
            ¿Listo para automatizar tus ventas?
          </h2>
          <Link href="/register">
            <Button size="lg" variant="secondary">
              Empezar gratis — 14 días
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <span>YD Social Ops © 2026</span>
          </div>
          <div className="flex gap-4">
            <Link
              href="/pricing"
              className="hover:text-foreground transition-colors font-medium text-foreground"
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
              className="hover:text-foreground transition-colors"
            >
              Términos
            </Link>
            <Link
              href="/privacy#cookies"
              className="hover:text-foreground transition-colors"
            >
              Cookies
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
