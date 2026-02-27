import Link from "next/link";
import {
  Bot,
  Zap,
  Shield,
  MessageSquare,
  TrendingUp,
  Package,
  ArrowRight,
  CheckCircle,
  Star,
  UserPlus,
  Settings,
  Rocket,
  Lock,
  Globe,
  HeadphonesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  WhatsAppIcon,
  MessengerIcon,
  InstagramIcon,
  TikTokIcon,
  MercadoPagoIcon,
} from "@/components/ui/social-icons";
import JsonLd from "@/components/seo/json-ld";
import { LandingNav } from "@/components/landing/landing-nav";

const features = [
  {
    icon: Bot,
    title: "Bot de ventas con IA",
    description:
      "GPT-4o responde dudas, muestra productos y cierra ventas 24/7 sin que estés presente.",
  },
  {
    icon: MessageSquare,
    title: "Multi-canal",
    description:
      "Integra con WhatsApp, Instagram, TikTok y tu sitio web desde una sola plataforma.",
  },
  {
    icon: Zap,
    title: "Pagos automáticos",
    description:
      "Genera links de pago de Mercado Pago en segundos. El stock se descuenta solo.",
  },
  {
    icon: Package,
    title: "Gestión de inventario",
    description:
      "Administra tu catálogo fácilmente. El bot siempre conoce tu stock actualizado.",
  },
  {
    icon: TrendingUp,
    title: "Analytics en tiempo real",
    description:
      "Ve qué productos se consultan más, cuántos clientes convierten y cuánto vendes.",
  },
  {
    icon: Shield,
    title: "Seguro y confiable",
    description:
      "Tokens cifrados con AES-256. Tu cuenta de Mercado Pago siempre protegida.",
  },
];

const testimonials = [
  {
    name: "María González",
    business: "Tienda de ropa online",
    text: "Triplicamos las ventas en el primer mes. El bot responde a las 3 AM cuando yo duermo.",
    stars: 5,
  },
  {
    name: "Carlos Ruiz",
    business: "Productos artesanales",
    text: "Antes perdía clientes por no responder rápido. Ahora el bot lo hace instantáneamente.",
    stars: 5,
  },
  {
    name: "Ana Torres",
    business: "Cosméticos naturales",
    text: "La integración con Mercado Pago es increíble. Los pagos llegan directo a mi cuenta.",
    stars: 5,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <LandingNav />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          <Zap className="w-3 h-3 mr-1" />
          Automatiza tus ventas hoy mismo
        </Badge>
        <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6">
          Tu bot de ventas
          <br />
          <span className="text-primary">inteligente en redes sociales</span>
        </h1>
        <p className="text-sm sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8 px-1">
          Responde clientes, genera links de pago de Mercado Pago y descuenta
          stock automáticamente — mientras tú descansas.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="w-full sm:w-auto">
              Empieza gratis — 14 días
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Ver precios
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Sin tarjeta de crédito. Sin configuración compleja.
        </p>
      </section>

      {/* Bot Preview */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="rounded-2xl border bg-card p-4 sm:p-6 shadow-lg max-w-sm mx-auto">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Sofía — Bot de Ventas</p>
              <p className="text-xs text-green-500">● En línea</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-sm max-w-[80%]">
                Hola! Tienen poleras negras talla M?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 text-sm max-w-[85%]">
                ¡Hola! Sí, tenemos Polera Negra Básica talla M a $9.990. Tenemos 15 unidades disponibles. ¿Te la envío? 🛍️
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-sm max-w-[80%]">
                Sí! Quiero comprar una
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 text-sm max-w-[85%]">
                Perfecto! Aquí está tu link de pago seguro 👇<br />
                <span className="text-primary underline text-xs mt-1 block">mpago.cl/links/xxx...</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">
            Listo en 3 pasos
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Configura tu bot de ventas en minutos, sin necesidad de código.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "1",
              icon: UserPlus,
              title: "Crea tu cuenta",
              description:
                "Regístrate gratis y nuestro asistente te guía para configurar tu negocio, productos y canales.",
            },
            {
              step: "2",
              icon: Settings,
              title: "Conecta tus canales",
              description:
                "Vincula WhatsApp, Instagram, Messenger o tu sitio web con un clic. El bot empieza a responder.",
            },
            {
              step: "3",
              icon: Rocket,
              title: "Vende 24/7",
              description:
                "Tu bot atiende clientes, genera links de pago y descuenta stock mientras tú descansas.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="text-center relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 relative">
                  <Icon className="w-7 h-7 text-primary" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Integrations */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t">
        <div className="text-center mb-8">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Se integra con las plataformas que ya usas
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 md:gap-12">
            <div className="flex items-center gap-2 text-muted-foreground hover:text-green-600 transition-colors">
              <WhatsAppIcon size={28} />
              <span className="text-sm font-medium">WhatsApp</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground hover:text-pink-600 transition-colors">
              <InstagramIcon size={28} />
              <span className="text-sm font-medium">Instagram</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground hover:text-blue-600 transition-colors">
              <MessengerIcon size={28} />
              <span className="text-sm font-medium">Messenger</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <TikTokIcon size={28} />
              <span className="text-sm font-medium">TikTok</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground hover:text-blue-500 transition-colors">
              <MercadoPagoIcon size={28} />
              <span className="text-sm font-medium">Mercado Pago</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">
            Todo lo que necesitas para vender más
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Desde responder consultas hasta cerrar pagos, tu bot lo hace todo.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="p-6 rounded-xl border bg-card hover:border-primary/40 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">
            Miles de vendedores ya lo usan
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="p-6 rounded-xl border bg-card">
              <div className="flex mb-3">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground mb-4">&ldquo;{t.text}&rdquo;</p>
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.business}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Badges */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div className="flex flex-col items-center gap-2 p-4">
            <Lock className="w-6 h-6 text-primary" />
            <p className="text-sm font-medium">Cifrado AES-256</p>
            <p className="text-xs text-muted-foreground">
              Tus tokens e integraciones están protegidos con cifrado de grado militar
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 p-4">
            <Globe className="w-6 h-6 text-primary" />
            <p className="text-sm font-medium">Hecho para LATAM</p>
            <p className="text-xs text-muted-foreground">
              Precios en CLP, Mercado Pago nativo y soporte en español
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 p-4">
            <HeadphonesIcon className="w-6 h-6 text-primary" />
            <p className="text-sm font-medium">Soporte humano</p>
            <p className="text-xs text-muted-foreground">
              Nuestro equipo te ayuda a configurar y optimizar tu bot
            </p>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
        <div className="rounded-2xl bg-primary text-primary-foreground p-6 sm:p-8 md:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">
            Empieza a vender más hoy mismo
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-md mx-auto">
            14 días de prueba gratuita. Sin tarjeta de crédito.
            Cancela cuando quieras.
          </p>
          <Link href="/register">
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              Crear cuenta gratis
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground flex-wrap">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <span>YD Social Ops © 2026</span>
          </div>
          <div className="flex flex-wrap gap-3 sm:gap-4 justify-center sm:justify-end">
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Precios
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacidad
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Términos
            </Link>
            <Link href="/privacy#cookies" className="hover:text-foreground transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </footer>
      <JsonLd />
    </div>
  );
}
