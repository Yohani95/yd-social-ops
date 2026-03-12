import { MessageSquare, Layers, Timer, CheckCircle } from "lucide-react";

const stats = [
  { icon: MessageSquare, value: "10.000+", label: "Mensajes procesados/día" },
  { icon: Layers, value: "5", label: "Canales integrados" },
  { icon: Timer, value: "30 min", label: "Setup inicial" },
  { icon: CheckCircle, value: "99.9%", label: "Uptime garantizado" },
];

export function MetricsBar() {
  return (
    <section className="border-y bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xl font-bold leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
