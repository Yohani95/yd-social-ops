"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Database, RefreshCw, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SetupRequiredStateProps {
  module: string;
  message?: string;
  migrationFile?: string;
  planRequired?: string;
  readinessStatus?: "ready" | "setup_required" | "plan_upgrade_required";
  featureFlags?: string[];
  onRetry?: () => void;
  compact?: boolean;
}

export function SetupRequiredState({
  module,
  message,
  migrationFile,
  planRequired,
  readinessStatus = "setup_required",
  featureFlags = [],
  onRetry,
  compact = false,
}: SetupRequiredStateProps) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <Card
      className={compact ? "border-dashed border-amber-300 bg-amber-50/60" : "border-amber-300 bg-amber-50/70"}
      aria-live="polite"
    >
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base text-amber-950">Modulo pendiente de activacion</CardTitle>
            <CardDescription className="mt-1 text-amber-900/80">
              {module}: {message || "Aun no se ha aplicado la migracion de base de datos en este entorno."}
            </CardDescription>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                {readinessStatus === "plan_upgrade_required" ? "Disponible en plan superior" : "Requiere setup"}
              </span>
              {planRequired ? (
                <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-900">
                  Plan requerido: {planRequired}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : undefined}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => setShowSteps((prev) => !prev)}
            aria-expanded={showSteps}
          >
            <Wrench className="h-4 w-4" />
            Ver pasos de activacion
            <ChevronDown className={`h-4 w-4 transition-transform ${showSteps ? "rotate-180" : ""}`} />
          </Button>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              onClick={onRetry}
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          ) : null}
        </div>

        {showSteps ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white/80 p-4 text-sm text-amber-950">
            <div className="flex items-center gap-2 font-medium">
              <Database className="h-4 w-4" />
              Activacion requerida
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Aplicar la migracion pendiente en Supabase para este entorno.</li>
              {migrationFile ? <li>Archivo de migracion: <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">{migrationFile}</code></li> : null}
              <li>Validar que las tablas del modulo existan y esten disponibles.</li>
              {featureFlags.length > 0 ? (
                <li>
                  Activar feature flags del tenant:{" "}
                  <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">{featureFlags.join(", ")}</code>
                </li>
              ) : null}
              <li>Volver a cargar la pagina para habilitar el modulo.</li>
            </ol>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
