"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Route, Megaphone, Bot, LineChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PATHS = [
  {
    id: "vender-hoy",
    title: "Vender hoy",
    description: "Configura canales, atiende bandeja y envia una campana inicial.",
    href: "/dashboard/campaigns",
    icon: Megaphone,
    steps: [
      "Confirma canales activos en Canales.",
      "Crea una campana con segmentacion simple.",
      "Ejecuta envio inmediato y revisa respuestas en Bandeja.",
    ],
  },
  {
    id: "automatizar-respuestas",
    title: "Automatizar respuestas",
    description: "Crea workflows para reducir carga operativa del equipo.",
    href: "/dashboard/workflows",
    icon: Bot,
    steps: [
      "Crea un workflow de respuesta inicial.",
      "Agrega condiciones por intencion/canal.",
      "Pruebalo y activalo.",
    ],
  },
  {
    id: "enrutar-equipo",
    title: "Enrutar al equipo",
    description: "Asigna conversaciones automaticamente por prioridad y tipo.",
    href: "/dashboard/routing",
    icon: Route,
    steps: [
      "Define regla base de ventas.",
      "Define regla base de soporte.",
      "Valida asignacion en bandeja.",
    ],
  },
  {
    id: "medir-resultados",
    title: "Medir resultados",
    description: "Usa metrica operativa y conversion para iterar con criterio.",
    href: "/dashboard/analytics",
    icon: LineChart,
    steps: [
      "Revisa conversion por canal.",
      "Revisa calidad del bot por canal.",
      "Ajusta workflows y campanas segun datos.",
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpen className="h-6 w-6 text-primary" />
          Primeros 30 minutos
        </h1>
        <p className="text-sm text-muted-foreground">
          Guia de operacion para pasar de configuracion inicial a primera accion comercial.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como usar esta guia</CardTitle>
          <CardDescription>
            Elige un objetivo y sigue 3 pasos. Cada ruta conecta directo al modulo correcto.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Para documentacion extendida revisa <code className="rounded bg-muted px-1 py-0.5">docs/PRIMEROS-30-MINUTOS.md</code>.
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Diferencia clave: Workflows vs Routing</CardTitle>
          <CardDescription>Evita mezclar responsabilidades para que el equipo entienda el sistema rapido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Workflows:</strong> definen que hace el bot (responder, etiquetar, mover etapa, disparar webhook).</p>
          <p><strong className="text-foreground">Routing:</strong> define a quien se asigna la conversacion (equipo/agente) cuando se cumplen reglas.</p>
          <p>Regla simple: primero decide la accion (Workflow), luego decide el responsable (Routing).</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {PATHS.map((path) => {
          const Icon = path.icon;
          return (
            <Card key={path.id}>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{path.title}</CardTitle>
                  </div>
                  <Badge variant="outline">Objetivo</Badge>
                </div>
                <CardDescription>{path.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="space-y-1 text-sm text-muted-foreground">
                  {path.steps.map((step, idx) => (
                    <li key={step}>
                      {idx + 1}. {step}
                    </li>
                  ))}
                </ol>
                <Link
                  href={path.href}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Abrir modulo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
