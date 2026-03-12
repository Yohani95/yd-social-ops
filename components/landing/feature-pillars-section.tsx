import { CheckCircle, Zap, DollarSign, Inbox, BarChart3 } from "lucide-react";

const pillars = [
  {
    icon: Zap,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    title: "Automatiza",
    items: [
      "Bot IA 24/7 en todos los canales",
      "Workflows condicionales sin código",
      "Routing automático de conversaciones",
      "Configuración avanzada por canal",
    ],
  },
  {
    icon: DollarSign,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Vende",
    items: [
      "Links de pago Mercado Pago automáticos",
      "Catálogo de productos con stock en tiempo real",
      "Campañas masivas multi-canal",
      "Cobro merchant con aprobación manual o auto",
    ],
  },
  {
    icon: Inbox,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    title: "Gestiona",
    items: [
      "Inbox unificado multi-canal",
      "CRM con tags, notas y etapas de lead",
      "Base de conocimiento con RAG",
      "Gestión de equipo con roles y permisos",
    ],
  },
  {
    icon: BarChart3,
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    title: "Crece",
    items: [
      "Analytics de conversión por canal",
      "Métricas de calidad del bot",
      "Dashboard en tiempo real",
      "API pública para integraciones propias",
    ],
  },
];

export function FeaturePillarsSection() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
      <div className="text-center mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">
          Todo lo que necesitas, en un solo lugar
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Desde la automatización del bot hasta la analítica de ventas — sin necesitar otras herramientas.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div key={pillar.title} className="p-5 rounded-2xl border bg-card">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${pillar.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg mb-3">{pillar.title}</h3>
              <ul className="space-y-2">
                {pillar.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
