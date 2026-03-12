"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Code2,
  Copy,
  Check,
  KeyRound,
  Plus,
  Loader2,
  Terminal,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardModuleHeader } from "@/components/dashboard/module-header";
import { toast } from "sonner";
import { listApiKeys, createApiKey, type ApiKey } from "@/actions/api-keys";

const BASE = typeof window !== "undefined" ? window.location.origin : "https://tu-dominio.com";

type CopiedKey = string | null;

function CurlBlock({ code, id }: { code: string; id: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative rounded-lg bg-slate-950 dark:bg-black/60 border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400 font-mono">{id}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="p-4 text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

const endpoints = [
  {
    method: "POST",
    path: "/api/v1/messages",
    title: "Enviar mensaje al bot",
    description: "Envía un mensaje de usuario y recibe la respuesta del bot. Ideal para integrar el bot en cualquier plataforma externa.",
    methodColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    params: [
      { name: "message", type: "string", required: true, desc: "Mensaje del usuario" },
      { name: "contact_id", type: "string", required: false, desc: "ID del contacto (opcional para continuidad de contexto)" },
      { name: "channel", type: "string", required: false, desc: "Canal: web | whatsapp | instagram | messenger. Default: web" },
    ],
    curlFn: (key: string) => `curl -X POST ${BASE}/api/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "message": "Hola, ¿cuáles son sus productos?",
    "channel": "web"
  }'`,
    response: `{
  "success": true,
  "data": {
    "response": "¡Hola! Tenemos los siguientes productos disponibles...",
    "intent_detected": "inquiry",
    "contact_id": "uuid-del-contacto"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/contacts",
    title: "Listar contactos",
    description: "Obtiene los contactos del CRM del tenant. Soporta paginación y filtros.",
    methodColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    params: [
      { name: "limit", type: "number", required: false, desc: "Máximo de resultados. Default: 50, max: 200" },
      { name: "offset", type: "number", required: false, desc: "Offset para paginación" },
      { name: "channel", type: "string", required: false, desc: "Filtrar por canal" },
    ],
    curlFn: (key: string) => `curl "${BASE}/api/v1/contacts?limit=20&offset=0" \\
  -H "Authorization: Bearer ${key}"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Juan Pérez",
      "phone": "+56912345678",
      "channel": "whatsapp",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "total": 120
}`,
  },
  {
    method: "POST",
    path: "/api/bot/train",
    title: "Entrenar el bot con texto",
    description: "Importa texto libre (de ChatGPT u otra IA) como conocimiento del bot. El texto se divide en chunks automáticamente.",
    methodColor: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    params: [
      { name: "text", type: "string", required: true, desc: "Texto a importar. Separar múltiples chunks con línea '---'" },
      { name: "topic", type: "string", required: false, desc: "Categoría del conocimiento. Default: general" },
      { name: "source", type: "string", required: false, desc: "Fuente: products | faq | chat_logs | manual. Default: manual" },
    ],
    curlFn: (key: string) => `curl -X POST ${BASE}/api/bot/train \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "source": "faq",
    "topic": "envios",
    "text": "¿Cuánto tarda el envío? Entre 3 y 5 días hábiles.\\n---\\n¿Envían al extranjero? Solo a países de LATAM."
  }'`,
    response: `{
  "success": true,
  "data": {
    "imported": 2,
    "skipped": 0,
    "errors": [],
    "version": 3,
    "total_chunks": 2
  }
}`,
  },
  {
    method: "GET",
    path: "/api/bot/quality",
    title: "Métricas de calidad del bot",
    description: "Obtiene métricas de rendimiento: latencia, tasa de repetición, fallback y distribución de intenciones.",
    methodColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    params: [
      { name: "from", type: "string (ISO8601)", required: false, desc: "Fecha de inicio. Default: últimos 7 días" },
      { name: "channel", type: "string", required: false, desc: "Filtrar por canal específico" },
    ],
    curlFn: (key: string) => `curl "${BASE}/api/bot/quality?from=2026-03-01T00:00:00Z" \\
  -H "Authorization: Bearer ${key}"`,
    response: `{
  "success": true,
  "data": {
    "total_responses": 450,
    "avg_latency_ms": 1800,
    "p95_latency_ms": 3200,
    "repetition_rate": 0.04,
    "fallback_rate": 0.12,
    "intent_breakdown": {
      "purchase_intent": 180,
      "inquiry": 210,
      "greeting": 60
    }
  }
}`,
  },
];

export default function ApiDocsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, startCreate] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [revealedKey, setRevealedKey] = useState<CopiedKey>(null);
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);

  const activeKey = keys.find((k) => k.is_active);

  useEffect(() => {
    listApiKeys().then((r) => {
      if (r.success) setKeys(r.data ?? []);
      setLoading(false);
    });
  }, []);

  function handleCreate() {
    if (!newLabel.trim()) return;
    startCreate(async () => {
      const r = await createApiKey({ label: newLabel.trim(), scopes: ["all"] });
      if (r.success && r.data) {
        toast.success("API Key creada — cópiala ahora, no se volverá a mostrar completa");
        setRevealedKey(r.data.secret_key);
        navigator.clipboard.writeText(r.data.secret_key).catch(() => {});
        const refreshed = await listApiKeys();
        if (refreshed.success) setKeys(refreshed.data ?? []);
        setShowCreate(false);
        setNewLabel("");
      } else {
        toast.error(r.error || "Error al crear API Key");
      }
    });
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <DashboardModuleHeader
        domain="integrations"
        icon={Code2}
        title="API Docs"
        description="Documentacion tecnica para integrar YD Social Ops con API Key, endpoints y ejemplos listos para copiar."
        meta={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              API publica REST
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              {endpoints.length} endpoints de referencia
            </Badge>
          </div>
        )}
      />

      {/* Auth section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" />
            Autenticación
          </CardTitle>
          <CardDescription className="text-xs">
            Todas las peticiones deben incluir el header <code className="bg-muted px-1 rounded">Authorization: Bearer TU_API_KEY</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando claves...
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              <KeyRound className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
              No tienes API Keys activas.
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{k.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      yd_{k.key_prefix}••••••••
                    </p>
                  </div>
                  <Badge variant={k.is_active ? "success" : "secondary"} className="text-[11px]">
                    {k.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  {k.last_used_at && (
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      Último uso: {new Date(k.last_used_at).toLocaleDateString("es-CL")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {revealedKey && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                API Key generada — cópiala ahora, no se mostrará de nuevo
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white dark:bg-black/40 rounded border px-2 py-1 truncate">
                  {revealedKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey);
                    toast.success("Copiada");
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRevealedKey(null)} className="text-xs">
                Ocultar
              </Button>
            </div>
          )}

          {showCreate ? (
            <div className="flex gap-2">
              <Input
                placeholder="Nombre de la clave (ej: Producción, n8n)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="flex-1"
                autoFocus
              />
              <Button onClick={handleCreate} disabled={creating || !newLabel.trim()} size="sm">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Generar nueva API Key
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Base URL */}
      <div className="rounded-xl border border-border/60 bg-slate-50 dark:bg-slate-950/40 p-4">
        <p className="text-xs text-muted-foreground mb-1">Base URL</p>
        <code className="text-sm font-mono font-medium">{BASE}</code>
      </div>

      {/* Endpoints */}
      <div className="space-y-6">
        {endpoints.map((ep) => (
          <Card key={ep.path} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <Badge
                  variant="outline"
                  className={`text-xs font-bold font-mono px-2 py-0.5 shrink-0 border ${ep.methodColor}`}
                >
                  {ep.method}
                </Badge>
                <div className="min-w-0">
                  <code className="text-sm font-mono font-semibold">{ep.path}</code>
                  <CardTitle className="text-sm font-medium mt-0.5 text-muted-foreground">{ep.title}</CardTitle>
                </div>
              </div>
              <CardDescription className="text-xs mt-2">{ep.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Parameters */}
              {ep.params.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Parámetros</p>
                  <div className="rounded-lg border overflow-hidden">
                    {ep.params.map((p, i) => (
                      <div key={p.name} className={`flex gap-3 px-3 py-2.5 text-xs ${i > 0 ? "border-t border-border/50" : ""}`}>
                        <code className="font-mono font-medium w-32 shrink-0">{p.name}</code>
                        <span className="text-muted-foreground w-24 shrink-0">{p.type}</span>
                        <Badge variant={p.required ? "default" : "secondary"} className="text-[10px] h-4 shrink-0">
                          {p.required ? "requerido" : "opcional"}
                        </Badge>
                        <span className="text-muted-foreground">{p.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Curl example */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Ejemplo</p>
                <CurlBlock
                  id={`${ep.method} ${ep.path}`}
                  code={ep.curlFn(activeKey ? `yd_${activeKey.key_prefix}...` : "TU_API_KEY")}
                />
              </div>

              {/* Response */}
              <div>
                <button
                  className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors"
                  onClick={() => setExpandedResponse(expandedResponse === ep.path ? null : ep.path)}
                >
                  Respuesta de ejemplo
                  {expandedResponse === ep.path ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                {expandedResponse === ep.path && (
                  <CurlBlock id="response.json" code={ep.response} />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer note */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <p><strong>Rate limit:</strong> 60 peticiones/minuto por API Key.</p>
        <p><strong>Formato:</strong> Todas las respuestas son JSON con <code className="bg-muted px-1 rounded">{"{ success, data }"}</code> o <code className="bg-muted px-1 rounded">{"{ success: false, error }"}</code>.</p>
        <p><strong>Errores comunes:</strong> 401 sin API Key válida · 422 cuerpo inválido · 429 rate limit.</p>
      </div>
    </div>
  );
}

