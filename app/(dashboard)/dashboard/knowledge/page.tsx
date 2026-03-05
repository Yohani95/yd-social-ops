"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  Tag,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useDashboard } from "@/components/dashboard/dashboard-context";

type KnowledgeChunk = {
  id: string;
  source: string;
  topic: string;
  content: string;
  confidence: number;
  version: number;
  is_active: boolean;
  created_at: string;
};

type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

const SOURCE_LABELS: Record<string, string> = {
  products: "Productos",
  faq: "FAQ",
  chat_logs: "Historial de chats",
  manual: "Manual / Políticas",
};

export default function KnowledgePage() {
  const { tenantId } = useDashboard();
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Import form state
  const [importSource, setImportSource] = useState<string>("faq");
  const [importTopic, setImportTopic] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importConfidence, setImportConfidence] = useState("0.9");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    fetchChunks();
  }, []);

  async function fetchChunks() {
    setLoading(true);
    try {
      const res = await fetch("/api/bot/knowledge/list");
      if (res.ok) {
        const data = await res.json();
        setChunks(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!importTopic.trim() || !importContent.trim()) {
      toast.error("Topic y contenido son obligatorios");
      return;
    }

    startTransition(async () => {
      setImportResult(null);
      const confidence = parseFloat(importConfidence);
      const chunks_payload = importContent
        .split("\n---\n")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((content) => ({ content, metadata: { confidence } }));

      if (chunks_payload.length === 0) {
        toast.error("El contenido no puede estar vacío");
        return;
      }

      try {
        const res = await fetch("/api/bot/knowledge/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: importSource,
            topic: importTopic,
            chunks: chunks_payload,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setImportResult(data.data);
          toast.success(`${data.data.imported} chunk(s) importados`);
          fetchChunks();
          if (data.data.imported > 0) {
            setImportContent("");
            setImportTopic("");
          }
        } else {
          toast.error(data.error || "Error al importar");
        }
      } catch (err) {
        console.error(err);
        toast.error("Error de red");
      }
    });
  }

  async function handleDeactivate(id: string) {
    if (!confirm("¿Desactivar este chunk?")) return;
    try {
      const res = await fetch(`/api/bot/knowledge/list?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setChunks((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: false } : c)));
        toast.success("Chunk desactivado");
      } else {
        toast.error("Error al desactivar");
      }
    } catch {
      toast.error("Error de red");
    }
  }

  const filtered = chunks.filter((c) => {
    const matchSearch =
      !searchQuery ||
      c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.topic.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSource = filterSource === "all" || c.source === filterSource;
    return matchSearch && matchSource;
  });

  const activeCount = chunks.filter((c) => c.is_active).length;
  const sourceGroups = [...new Set(chunks.map((c) => c.source))];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            Base de Conocimiento
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            El bot usa este contenido para responder con información precisa de tu negocio
          </p>
        </div>
        <Button onClick={() => setShowImport(!showImport)} className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          Agregar contenido
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total chunks", value: chunks.length, color: "text-foreground" },
          { label: "Activos", value: activeCount, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Fuentes", value: sourceGroups.length, color: "text-blue-600 dark:text-blue-400" },
          { label: "Topics", value: new Set(chunks.map((c) => c.topic)).size, color: "text-purple-600 dark:text-purple-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Import panel */}
      {showImport && (
        <Card className="border-emerald-200 dark:border-emerald-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-600" />
              Importar nuevo contenido
            </CardTitle>
            <CardDescription>
              Separa múltiples chunks con <code className="bg-muted px-1 rounded text-xs">---</code> en una línea sola.
              Cada chunk es un fragmento de conocimiento independiente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Fuente</Label>
                <select
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Topic / Categoría</Label>
                <Input
                  placeholder="ej: precios, envíos, horarios"
                  value={importTopic}
                  onChange={(e) => setImportTopic(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confianza (0–1)</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={importConfidence}
                  onChange={(e) => setImportConfidence(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Contenido</Label>
              <Textarea
                placeholder={`El producto XYZ cuesta $10.000 y viene en 3 colores: rojo, azul y verde.\n---\nLos envíos demoran entre 2 y 5 días hábiles en todo Chile.\n---\nNuestro horario de atención es lunes a viernes de 9:00 a 18:00.`}
                rows={8}
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {importContent.split("\n---\n").filter(Boolean).length} chunk(s) detectado(s)
              </p>
            </div>

            {importResult && (
              <div className={`flex items-start gap-3 p-3 rounded-lg text-sm border ${
                importResult.errors.length > 0
                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                  : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900"
              }`}>
                {importResult.errors.length > 0 ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">
                    {importResult.imported} importado(s) · {importResult.skipped} omitido(s)
                  </p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground mt-0.5">{e}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar
              </Button>
              <Button variant="ghost" onClick={() => { setShowImport(false); setImportResult(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en contenido o topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-40"
        >
          <option value="all">Todas las fuentes</option>
          {Object.entries(SOURCE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <Button variant="outline" size="icon" onClick={fetchChunks} className="shrink-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Chunks list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-2xl bg-muted/20">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <h3 className="font-semibold">
            {chunks.length === 0 ? "Sin contenido cargado" : "Sin resultados"}
          </h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            {chunks.length === 0
              ? "Agrega productos, FAQ o políticas para que el bot responda con información precisa"
              : "Prueba con otro filtro o búsqueda"}
          </p>
          {chunks.length === 0 && (
            <Button onClick={() => setShowImport(true)} className="mt-5 gap-2">
              <Plus className="w-4 h-4" />
              Agregar primer contenido
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((chunk) => (
            <div
              key={chunk.id}
              className={`rounded-xl border transition-all ${
                chunk.is_active
                  ? "border-border/60 bg-card"
                  : "border-border/30 bg-muted/20 opacity-60"
              }`}
            >
              <button
                className="w-full text-left p-4 flex items-start justify-between gap-3"
                onClick={() => setExpandedId(expandedId === chunk.id ? null : chunk.id)}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[11px] py-0 px-1.5 h-4 gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {chunk.topic}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {SOURCE_LABELS[chunk.source] || chunk.source}
                      </span>
                      <span className="text-[11px] text-muted-foreground">v{chunk.version}</span>
                      <span className={`text-[11px] font-medium ${
                        chunk.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      }`}>
                        {chunk.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {chunk.content}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {expandedId === chunk.id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {expandedId === chunk.id && (
                <>
                  <Separator />
                  <div className="p-4 space-y-3">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{chunk.content}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Confianza: <strong>{(chunk.confidence * 100).toFixed(0)}%</strong></span>
                        <span>{new Date(chunk.created_at).toLocaleDateString("es-CL")}</span>
                      </div>
                      {chunk.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-7 text-xs"
                          onClick={() => handleDeactivate(chunk.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Desactivar
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
