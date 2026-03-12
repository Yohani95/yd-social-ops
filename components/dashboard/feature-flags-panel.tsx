"use client";

import { useState, useTransition, useEffect } from "react";
import { setFeatureFlag } from "@/actions/feature-flags";
import type { FeatureFlag } from "@/lib/feature-flags";

interface FlagDef {
  flag: FeatureFlag;
  label: string;
  description: string;
  planRequired?: "pro" | "business" | "enterprise";
}

const FLAG_DEFINITIONS: FlagDef[] = [
  {
    flag: "quality_tracking_enabled",
    label: "Tracking de Calidad",
    description: "Registra métricas de calidad (latencia, repetición, proveedor) en cada respuesta del bot.",
  },
  {
    flag: "repetition_guard_enabled",
    label: "Guardia de Repetición",
    description: "Detecta y marca respuestas repetitivas del bot.",
  },
  {
    flag: "advanced_config_enabled",
    label: "Configuración Avanzada",
    description: "Aplica configuración avanzada (max_chars, coherence_window) desde tenant_bot_configs.",
  },
  {
    flag: "instagram_comments_enabled",
    label: "Comentarios Instagram",
    description: "Procesa comentarios públicos de Instagram y los enruta según las reglas de automatización.",
    planRequired: "pro",
  },
  {
    flag: "rag_enabled",
    label: "RAG (Base de Conocimiento)",
    description: "Enriquece el prompt del bot con chunks de conocimiento relevantes al query del usuario.",
    planRequired: "business",
  },
  {
    flag: "scheduling_enabled",
    label: "Agendamiento (Calendly)",
    description: "Habilita las herramientas de agendamiento en el bot: consultar disponibilidad, reservar y cancelar citas.",
    planRequired: "pro",
  },
  {
    flag: "ecommerce_enabled",
    label: "E-commerce (WooCommerce / Shopify)",
    description: "Habilita la herramienta de consulta de pedidos en el bot cuando hay una integración e-commerce activa.",
    planRequired: "pro",
  },
];

interface FeatureFlagsPanelProps {
  initialFlags: Record<string, boolean>;
  planTier: string;
}

export function FeatureFlagsPanel({ initialFlags, planTier }: FeatureFlagsPanelProps) {
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Sync when parent loads flags async
  useEffect(() => {
    setFlags(initialFlags);
  }, [initialFlags]);

  const planOrder = ["basic", "pro", "business", "enterprise", "enterprise_plus"];
  const planIndex = planOrder.indexOf(planTier);

  function isPlanAllowed(required?: "pro" | "business" | "enterprise"): boolean {
    if (!required) return true;
    const requiredIndex = planOrder.indexOf(required);
    return planIndex >= requiredIndex;
  }

  function handleToggle(flag: FeatureFlag, enabled: boolean) {
    setError(null);
    const prev = { ...flags };
    setFlags((f) => ({ ...f, [flag]: enabled }));

    startTransition(async () => {
      const result = await setFeatureFlag(flag, enabled);
      if (!result.success) {
        setFlags(prev);
        setError(result.error ?? "Error al actualizar el flag");
      } else {
        setFlags(result.data ?? { ...prev, [flag]: enabled });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Feature Flags</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Los cambios aplican en menos de 30 segundos sin reiniciar el servidor.
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {FLAG_DEFINITIONS.map(({ flag, label, description, planRequired }) => {
          const allowed = isPlanAllowed(planRequired);
          const isOn = flags[flag] === true;

          return (
            <div key={flag} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${allowed ? "text-gray-800" : "text-gray-400"}`}>
                    {label}
                  </span>
                  {planRequired && !allowed && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                      {planRequired}+
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${allowed ? "text-gray-500" : "text-gray-400"}`}>
                  {description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                disabled={!allowed || isPending}
                onClick={() => handleToggle(flag, !isOn)}
                className={`
                  relative flex-shrink-0 inline-flex h-5 w-9 items-center rounded-full
                  transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${isOn ? "bg-indigo-600" : "bg-gray-200"}
                `}
              >
                <span
                  className={`
                    inline-block h-3.5 w-3.5 rounded-full bg-white shadow
                    transform transition-transform duration-200
                    ${isOn ? "translate-x-4" : "translate-x-0.5"}
                  `}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
