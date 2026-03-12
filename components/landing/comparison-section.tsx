import { CheckCircle, XCircle } from "lucide-react";

const rows = [
  {
    feature: "Respuesta al cliente",
    without: "Manual, horas de espera",
    with: "Automática en segundos, 24/7",
  },
  {
    feature: "Generación de cobros",
    without: "Datos bancarios en texto plano",
    with: "Link de pago MP seguro, automático",
  },
  {
    feature: "Control de stock",
    without: "Actualización manual, errores frecuentes",
    with: "Descuento automático al confirmar pago",
  },
  {
    feature: "Multi-canal",
    without: "Atender 4 apps por separado",
    with: "Un inbox unificado para todo",
  },
  {
    feature: "Escalabilidad",
    without: "Más ventas = más tiempo perdido",
    with: "El bot maneja el volumen sin esfuerzo",
  },
  {
    feature: "Analytics",
    without: "Sin datos, decisiones a ciegas",
    with: "Dashboard en tiempo real con conversiones",
  },
];

export function ComparisonSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t">
      <div className="text-center mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">
          ¿Qué cambia con YD Social Ops?
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          La diferencia entre vender manualmente y tener un sistema que trabaja por ti.
        </p>
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
        <span>Característica</span>
        <span className="text-center">Sin automatización</span>
        <span className="text-center text-primary">Con YD Social Ops</span>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.feature}
            className="grid grid-cols-3 gap-2 items-start rounded-xl border p-3 bg-card text-sm"
          >
            <span className="font-medium">{row.feature}</span>
            <div className="flex items-start gap-2 text-muted-foreground/70">
              <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{row.without}</span>
            </div>
            <div className="flex items-start gap-2 text-foreground">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <span>{row.with}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
