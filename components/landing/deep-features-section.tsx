import { Inbox, Megaphone, BarChart3 } from "lucide-react";

const spotlights = [
  {
    icon: Inbox,
    tag: "Inbox + CRM",
    title: "Todas tus conversaciones, en un solo panel",
    description:
      "Gestiona WhatsApp, Instagram, Messenger y más desde una bandeja unificada. Asigna conversaciones, agrega notas, cambia el estado del lead y responde manualmente cuando lo necesitas.",
    mock: (
      <div className="rounded-xl border bg-background p-4 space-y-3 text-xs">
        {[
          { channel: "WA", name: "María González", msg: "Cuánto vale la polera negra?", time: "hace 2 min", tag: "Nuevo" },
          { channel: "IG", name: "Carlos Ruiz", msg: "Me interesa el servicio de...", time: "hace 15 min", tag: "Calificado" },
          { channel: "MSG", name: "Ana Torres", msg: "Confirmo el pago!", time: "hace 1 h", tag: "Pagado" },
        ].map((item) => (
          <div key={item.name} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
              {item.channel}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold truncate">{item.name}</span>
                <span className="text-muted-foreground text-[10px] shrink-0 ml-2">{item.time}</span>
              </div>
              <p className="text-muted-foreground truncate">{item.msg}</p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
              item.tag === "Pagado" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              item.tag === "Calificado" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
              "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            }`}>{item.tag}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Megaphone,
    tag: "Campañas + Workflows",
    title: "Automatiza todo el embudo, de extremo a extremo",
    description:
      "Diseña flujos de automatización sin código: desde que un cliente escribe hasta que confirma el pago. Combina condiciones, acciones y campañas masivas en un solo workflow.",
    mock: (
      <div className="rounded-xl border bg-background p-5 space-y-3">
        {[
          { label: "Trigger", desc: "Mensaje recibido", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
          { label: "Condición", desc: "Intención: compra detectada", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
          { label: "Acción", desc: "Generar link de pago MP", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
        ].map((node, i) => (
          <div key={node.label} className="relative">
            <div className={`rounded-lg px-4 py-3 text-sm ${node.color}`}>
              <span className="font-semibold">{node.label}:</span> {node.desc}
            </div>
            {i < 2 && (
              <div className="flex justify-center py-1">
                <div className="w-px h-4 bg-border" />
              </div>
            )}
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: BarChart3,
    tag: "Analytics de conversión",
    title: "Mide cada paso del embudo de ventas",
    description:
      "Visualiza el embudo completo: mensajes recibidos, intenciones detectadas, links generados y pagos confirmados. Por canal, por producto, por período.",
    mock: (
      <div className="rounded-xl border bg-background p-5 space-y-3 text-xs">
        <p className="font-semibold text-sm mb-3">Embudo de ventas — últimos 30 días</p>
        {[
          { label: "Mensajes recibidos", value: 1240, pct: 100, color: "bg-violet-500" },
          { label: "Intención de compra", value: 387, pct: 31, color: "bg-blue-500" },
          { label: "Links de pago generados", value: 210, pct: 17, color: "bg-orange-500" },
          { label: "Pagos confirmados", value: 143, pct: 12, color: "bg-emerald-500" },
        ].map((row) => (
          <div key={row.label}>
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold">{row.value.toLocaleString("es-CL")}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export function DeepFeaturesSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t space-y-20">
      {spotlights.map((s, i) => {
        const Icon = s.icon;
        const isEven = i % 2 === 0;
        return (
          <div
            key={s.tag}
            className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center ${isEven ? "" : "lg:flex-row-reverse"}`}
          >
            <div className={isEven ? "lg:order-1" : "lg:order-2"}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-primary">{s.tag}</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-4">{s.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{s.description}</p>
            </div>
            <div className={isEven ? "lg:order-2" : "lg:order-1"}>
              {s.mock}
            </div>
          </div>
        );
      })}
    </section>
  );
}
