"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { QARunSummary } from "@/types";

type SuiteName = "smoke" | "flows" | "bot-scorecard";

const SUITES: Array<{ key: SuiteName; label: string; description: string }> = [
  { key: "smoke", label: "Smoke", description: "Salud de paginas core" },
  { key: "flows", label: "Flows", description: "CRUD operativo principal" },
  { key: "bot-scorecard", label: "Bot scorecard", description: "Calidad conversacional por intencion" },
];

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export function QAClient() {
  const [runs, setRuns] = useState<QARunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedSuites, setSelectedSuites] = useState<SuiteName[]>(["smoke", "flows", "bot-scorecard"]);

  const lastRun = runs[0] || null;

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/qa/history", { cache: "no-store" });
      const json = (await res.json()) as { data?: QARunSummary[]; error?: string };
      if (!res.ok) throw new Error(json.error || "No se pudo cargar historial QA");
      setRuns(Array.isArray(json.data) ? json.data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar historial QA");
    } finally {
      setLoading(false);
    }
  }

  async function runSuites() {
    setRunning(true);
    try {
      const res = await fetch("/api/qa/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suites: selectedSuites }),
      });
      const json = (await res.json()) as { data?: QARunSummary; error?: string };
      if (!res.ok && res.status !== 207) throw new Error(json.error || "No se pudo ejecutar QA");
      if (json.data) {
        setRuns((prev) => [json.data!, ...prev].slice(0, 25));
      }
      if (res.status === 207) {
        toast.warning("QA finalizo con fallos. Revisa evidencia.");
      } else {
        toast.success("QA ejecutado correctamente");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar QA");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  const globalStats = useMemo(() => {
    if (!lastRun) return { passed: 0, failed: 0 };
    const passed = lastRun.suites.reduce((acc, suite) => acc + suite.passed, 0);
    const failed = lastRun.suites.reduce((acc, suite) => acc + suite.failed, 0);
    return { passed, failed };
  }, [lastRun]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FlaskConical className="h-6 w-6 text-primary" />
          QA interno
        </h1>
        <p className="text-sm text-muted-foreground">
          Vista disponible solo en desarrollo para validar smoke, flujos y scorecard del bot antes de deploy.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Ejecutar suites</CardTitle>
          <CardDescription>Selecciona suites y lanza validacion repetible del producto completo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SUITES.map((suite) => (
              <button
                key={suite.key}
                type="button"
                aria-pressed={selectedSuites.includes(suite.key)}
                onClick={() =>
                  setSelectedSuites((prev) =>
                    prev.includes(suite.key)
                      ? prev.filter((item) => item !== suite.key)
                      : [...prev, suite.key]
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selectedSuites.includes(suite.key) ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted/30"
                }`}
                title={suite.description}
              >
                {suite.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void runSuites()} disabled={running || selectedSuites.length === 0}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Ejecutar QA
            </Button>
            <Button variant="outline" onClick={() => void loadRuns()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Recargar historial
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Ultimo run</CardTitle>
              <CardDescription>
                {lastRun ? `${new Date(lastRun.finished_at).toLocaleString("es-CL")}` : "Aun no hay ejecuciones registradas"}
              </CardDescription>
            </div>
            {lastRun ? (
              <Badge variant={lastRun.status === "passed" ? "success" : "warning"}>
                {lastRun.status === "passed" ? "Aprobado" : "Con fallos"}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!lastRun ? (
            <p className="text-sm text-muted-foreground">Ejecuta una suite para ver resultados y evidencia aqui.</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Suites OK</p>
                  <p className="mt-2 text-2xl font-semibold">{globalStats.passed}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Suites con fallo</p>
                  <p className="mt-2 text-2xl font-semibold">{globalStats.failed}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Duracion total</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatDuration(
                      lastRun.suites.reduce((acc, suite) => acc + (suite.duration_ms || 0), 0)
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {lastRun.suites.map((suite) => (
                  <div key={suite.suite} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{suite.suite}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={suite.status === "passed" ? "success" : "warning"}>
                          {suite.status === "passed" ? "OK" : "Fallo"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDuration(suite.duration_ms || 0)}</span>
                      </div>
                    </div>
                    {suite.errors.length > 0 ? (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
                        {suite.errors.join("\n")}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Historial reciente</CardTitle>
          <CardDescription>Ultimas ejecuciones para comparar estabilidad y regresiones.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando historial...
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin historial todavia.</p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 8).map((run) => (
                <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{new Date(run.finished_at).toLocaleString("es-CL")}</p>
                    <p className="text-xs text-muted-foreground">{run.suites.map((suite) => suite.suite).join(" - ")}</p>
                  </div>
                  <Badge variant={run.status === "passed" ? "success" : "warning"}>
                    {run.status === "passed" ? "Aprobado" : "Fallo"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
