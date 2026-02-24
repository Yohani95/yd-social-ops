import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Zap,
  Crown,
  ArrowRight,
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
      { label: "Descuento de stock automático", included: false },
      { label: "Integración WhatsApp/Instagram", included: false },
      { label: "Analytics avanzados", included: false },
      { label: "White-label", included: false },
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
      { label: "Múltiples usuarios", included: false },
      { label: "White-label", included: false },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Para negocios que quieren escalar en todos los canales",
    price: 79990,
    currency: "CLP",
    period: "mes",
    badge: "Máximo poder",
    features: [
      { label: "Todo lo del Plan Pro", included: true },
      { label: "WhatsApp Business API", included: true },
      { label: "Instagram Messaging", included: true },
      { label: "TikTok Shop", included: true },
      { label: "Múltiples usuarios (equipo)", included: true },
      { label: "Analytics consolidados", included: true },
      { label: "White-label (tu marca)", included: true },
      { label: "Dominio personalizado", included: true },
      { label: "Soporte prioritario", included: true },
    ],
  },
];

const planLinks: Record<string, string> = {
  basic: process.env.MP_PLAN_BASIC_LINK || "/register",
  pro: process.env.MP_PLAN_PRO_LINK || "/register",
  enterprise: process.env.MP_PLAN_ENTERPRISE_LINK || "/register",
};

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

const planIcons = {
  basic: Bot,
  pro: Zap,
  enterprise: Crown,
};

export const metadata = { title: "Precios" };

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">YD Social Ops</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Iniciar sesión
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Empezar gratis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-8 text-center">
        <Badge variant="secondary" className="mb-4">
          14 días de prueba gratis en todos los planes
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          Precios simples y transparentes
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          Elige el plan que mejor se adapte a tu negocio. Sin contratos.
          Cancela cuando quieras.
        </p>
      </section>

      {/* Plans Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const Icon = planIcons[plan.id];
            const link = planLinks[plan.id] || "/register";

            return (
              <Card
                key={plan.id}
                className={`flex flex-col ${
                  plan.highlighted
                    ? "border-primary shadow-lg shadow-primary/10 relative"
                    : ""
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="px-4 py-1">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                {!plan.highlighted && plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="secondary" className="px-4 py-1">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        plan.highlighted
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
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
                  <a href={link} target="_blank" rel="noopener noreferrer" className="w-full">
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "default" : "outline"}
                      size="lg"
                    >
                      Suscribirse al Plan {plan.name}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </a>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 border-t">
        <h2 className="text-2xl font-bold text-center mb-8">
          Preguntas frecuentes
        </h2>
        <div className="space-y-6">
          {[
            {
              q: "¿Cómo funciona el período de prueba?",
              a: "Tienes 14 días gratis al crear tu cuenta. No necesitas tarjeta de crédito. Al terminar el período, puedes suscribirte al plan que prefieras.",
            },
            {
              q: "¿El dinero de las ventas llega directo a mi cuenta?",
              a: "Sí. Los pagos de tus clientes llegan directo a tu cuenta de Mercado Pago. Nosotros no intermediamos los fondos.",
            },
            {
              q: "¿Puedo cambiar de plan cuando quiera?",
              a: "Por supuesto. Puedes hacer upgrade o downgrade en cualquier momento desde tu panel de configuración.",
            },
            {
              q: "¿Cómo integro el bot a WhatsApp?",
              a: "El Plan Enterprise incluye integración con WhatsApp Business API. Te entregamos la URL del webhook para configurar en pocos minutos.",
            },
          ].map((faq) => (
            <div key={faq.q} className="border rounded-lg p-5">
              <h3 className="font-medium mb-2">{faq.q}</h3>
              <p className="text-sm text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

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
    </div>
  );
}
