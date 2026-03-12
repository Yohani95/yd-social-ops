import { ShoppingBag, Calendar, Building2, CheckCircle } from "lucide-react";

const personas = [
  {
    icon: ShoppingBag,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "E-commerce y tiendas online",
    description: "Responde consultas de productos, genera cobros y descuenta stock automáticamente.",
    bullets: [
      "Catálogo siempre actualizado para el bot",
      "Links de pago Mercado Pago en segundos",
      "Stock se descuenta al confirmar el pago",
    ],
  },
  {
    icon: Calendar,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    title: "Servicios y agendamiento",
    description: "Automatiza consultas de disponibilidad y pre-cierra citas sin que estés presente.",
    bullets: [
      "Responde horarios y disponibilidad 24/7",
      "Califica leads antes de pasarlos a tu equipo",
      "Integra pagos por adelantado o reserva",
    ],
  },
  {
    icon: Building2,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    title: "Agencias y resellers",
    description: "Gestiona múltiples clientes, canales y equipos desde una plataforma centralizada.",
    bullets: [
      "Multi-usuario con roles y permisos",
      "White-label con tu propia marca",
      "API para integraciones personalizadas",
    ],
  },
];

export function ForWhoSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
      <div className="text-center mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">
          Diseñado para tu tipo de negocio
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Ya sea que vendas productos, ofrezcas servicios o gestiones cuentas de clientes.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {personas.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="p-6 rounded-2xl border bg-card">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${p.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{p.description}</p>
              <ul className="space-y-2">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{b}</span>
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
