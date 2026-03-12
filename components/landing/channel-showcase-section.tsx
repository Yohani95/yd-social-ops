"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  WhatsAppIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
} from "@/components/ui/social-icons";
import { Globe } from "lucide-react";

const channels = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    Icon: () => <WhatsAppIcon size={20} />,
    plan: "Business",
    capabilities: [
      "Responde mensajes entrantes 24/7 con IA",
      "Genera links de pago Mercado Pago en la conversación",
      "Descuenta stock automáticamente al confirmar",
      "Escalación a agente humano desde el inbox",
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    Icon: () => <InstagramIcon size={20} />,
    plan: "Business",
    capabilities: [
      "Responde DMs automáticamente con IA",
      "Procesamiento de comentarios en publicaciones",
      "Captura leads desde conversaciones",
      "Bandeja unificada con WhatsApp y Messenger",
    ],
  },
  {
    id: "messenger",
    label: "Messenger",
    Icon: () => <MessengerIcon size={20} />,
    plan: "Business",
    capabilities: [
      "Automatiza respuestas desde tu página de Facebook",
      "Incluye Marketplace de Facebook",
      "Genera cobros directamente en el chat",
      "Historial unificado en el CRM",
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    Icon: () => <TikTokIcon size={20} />,
    plan: "Enterprise",
    comingSoon: true,
    capabilities: [
      "Responde mensajes directos TikTok",
      "Automatiza respuestas a comentarios de videos",
      "Conecta audiencias virales a tu embudo de ventas",
      "Integración con catálogo y pagos",
    ],
  },
  {
    id: "web",
    label: "Web Widget",
    Icon: () => <Globe className="w-5 h-5" />,
    plan: "Todos los planes",
    capabilities: [
      "Widget embebible en cualquier sitio web",
      "Bot activo sin necesidad de redes sociales",
      "Personalización de colores y nombre del bot",
      "Historial de conversación por sesión",
    ],
  },
];

export function ChannelShowcaseSection() {
  const [active, setActive] = useState("whatsapp");
  const current = channels.find((c) => c.id === active)!;

  return (
    <section id="channels" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
      <div className="text-center mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">
          Un canal para cada cliente
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Conecta donde están tus clientes. El bot responde igual de bien en todos.
        </p>
      </div>

      {/* Tab buttons */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {channels.map((ch) => {
          const Icon = ch.Icon;
          return (
            <button
              key={ch.id}
              onClick={() => setActive(ch.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                active === ch.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon />
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="max-w-2xl mx-auto rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              {<current.Icon />}
            </div>
            <div>
              <p className="font-semibold">{current.label}</p>
              <p className="text-xs text-muted-foreground">Canal integrado</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">Plan {current.plan}</Badge>
            {current.comingSoon && (
              <Badge variant="outline" className="text-orange-500 border-orange-300">
                OAuth próximamente
              </Badge>
            )}
          </div>
        </div>
        <ul className="space-y-3">
          {current.capabilities.map((cap) => (
            <li key={cap} className="flex items-start gap-3 text-sm">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <span>{cap}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
