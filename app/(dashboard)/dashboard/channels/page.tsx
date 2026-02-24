"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Share2,
  Plus,
  Loader2,
  Trash2,
  Copy,
  Power,
  PowerOff,
  MessageSquare,
  Check,
  Circle,
  ExternalLink,
  Globe,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import {
  getChannels,
  createChannel,
  toggleChannel,
  deleteChannel,
} from "@/actions/channels";
import type { SocialChannel, ChatChannel } from "@/types";

const CHANNEL_INFO: Record<
  string,
  {
    label: string;
    color: string;
    icon: string;
    description: string;
    steps: { title: string; description: string; link?: string }[];
  }
> = {
  web: {
    label: "Web Widget",
    color: "bg-violet-600",
    icon: "🌐",
    description: "Chat embebido en tu sitio web",
    steps: [
      { title: "Canal creado automáticamente", description: "El widget web está listo para usar" },
      { title: "Copia el código", description: "Ve a Configuración > Widget Web y copia el snippet" },
      { title: "Pégalo en tu sitio", description: "Agrega el <script> antes de </body>" },
    ],
  },
  whatsapp: {
    label: "WhatsApp Business",
    color: "bg-green-600",
    icon: "💬",
    description: "Responder mensajes de WhatsApp automáticamente",
    steps: [
      { title: "Cuenta WhatsApp Business", description: "Necesitas una cuenta de WhatsApp Business", link: "https://business.whatsapp.com/" },
      { title: "Conectar con Meta", description: "Vincula tu cuenta de WhatsApp con Meta Business Suite" },
      { title: "Verificar conexión", description: "Envía un mensaje de prueba para confirmar" },
    ],
  },
  messenger: {
    label: "Messenger",
    color: "bg-blue-600",
    icon: "💙",
    description: "Responder mensajes de Facebook Messenger",
    steps: [
      { title: "Página de Facebook", description: "Necesitas una Página de Facebook activa", link: "https://www.facebook.com/pages/create" },
      { title: "Conectar con Meta", description: "Vincula tu página para recibir mensajes" },
      { title: "Verificar conexión", description: "Envía un mensaje a tu página para probar" },
    ],
  },
  instagram: {
    label: "Instagram",
    color: "bg-pink-600",
    icon: "📸",
    description: "Mensajes directos de Instagram via API",
    steps: [
      { title: "Cuenta profesional", description: "Tu cuenta debe ser Profesional o Business", link: "https://help.instagram.com/502981923235522" },
      { title: "Conectar vía webhook", description: "Configura el webhook en tu integración" },
      { title: "Verificar conexión", description: "Envía un DM para probar" },
    ],
  },
  tiktok: {
    label: "TikTok",
    color: "bg-gray-900",
    icon: "🎵",
    description: "Mensajes directos de TikTok for Business",
    steps: [
      { title: "TikTok for Business", description: "Necesitas una cuenta de TikTok for Business", link: "https://www.tiktok.com/business/" },
      { title: "Configurar webhook", description: "Copia la URL del webhook y pégala en TikTok Developer Portal", link: "https://developers.tiktok.com/" },
      { title: "Agregar secret", description: "Configura el webhook secret para validar requests" },
    ],
  },
};

const PLAN_LIMITS: Record<string, { web: boolean; external: number }> = {
  basic: { web: true, external: 0 },
  pro: { web: true, external: 1 },
  enterprise: { web: true, external: 99 },
};

export default function ChannelsPage() {
  const { tenant, tenantId } = useDashboard();
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<SocialChannel[] | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const plan = tenant?.plan_tier || "basic";
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.basic;
  const externalChannels = channels?.filter((c) => c.channel_type !== "web") || [];

  useEffect(() => {
    getChannels().then(setChannels).catch(() => setChannels([]));
  }, []);

  useEffect(() => {
    if (searchParams.get("meta_success")) {
      toast.success("Canal de Meta conectado exitosamente");
    }
    if (searchParams.get("meta_error")) {
      toast.error(`Error al conectar Meta: ${searchParams.get("meta_error")}`);
    }
  }, [searchParams]);

  function handleToggle(ch: SocialChannel) {
    startTransition(async () => {
      const result = await toggleChannel(ch.id);
      if (result.success) {
        setChannels((prev) =>
          prev?.map((c) => (c.id === ch.id ? { ...c, is_active: !c.is_active } : c))
        );
        toast.success(ch.is_active ? "Canal desactivado" : "Canal activado");
      } else {
        toast.error(result.error || "Error");
      }
    });
  }

  function handleDelete(ch: SocialChannel) {
    if (!confirm(`¿Eliminar el canal ${CHANNEL_INFO[ch.channel_type]?.label}?`)) return;
    startTransition(async () => {
      const result = await deleteChannel(ch.id);
      if (result.success) {
        setChannels((prev) => prev?.filter((c) => c.id !== ch.id));
        toast.success("Canal eliminado");
      } else {
        toast.error(result.error || "Error");
      }
    });
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  function handleConnectMeta(channelType: "whatsapp" | "messenger") {
    const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
    if (!metaAppId) {
      toast.error("META_APP_ID no configurado. Agrega NEXT_PUBLIC_META_APP_ID en .env.local");
      return;
    }
    const appUrl = window.location.origin;
    const state = Buffer.from(JSON.stringify({ tenant_id: tenantId, channel_type: channelType })).toString("base64url");
    const redirectUri = `${appUrl}/api/auth/meta/callback`;
    const scopes = channelType === "whatsapp"
      ? "whatsapp_business_messaging,whatsapp_business_management"
      : "pages_messaging,pages_show_list";

    const params = new URLSearchParams({
      client_id: metaAppId,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      response_type: "code",
    });

    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  if (channels === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const usedTypes = new Set(channels.map((c) => c.channel_type as string));
  const availableTypes = Object.keys(CHANNEL_INFO).filter((t) => {
    if (usedTypes.has(t)) return false;
    if (t !== "web" && limits.external <= externalChannels.length) return false;
    return true;
  });

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="w-6 h-6" />
            Canales
          </h1>
          <p className="text-muted-foreground mt-1">
            Conecta canales para que tu bot atienda en múltiples plataformas
          </p>
        </div>
        {availableTypes.length > 0 && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" />
            Agregar canal
          </Button>
        )}
      </div>

      {/* Plan limits */}
      <Card className="bg-muted/30">
        <CardContent className="py-3 flex items-center justify-between text-sm">
          <span>
            Plan <Badge variant="secondary" className="capitalize mx-1">{plan}</Badge>
            — Web {limits.web ? "✓" : "✗"} · Canales externos: {externalChannels.length}/{limits.external === 99 ? "∞" : limits.external}
          </span>
          {plan !== "enterprise" && (
            <Badge variant="outline" className="cursor-pointer" onClick={() => window.location.href = "/pricing"}>
              Upgrade
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Channel list */}
      {channels.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <CardTitle>No tienes canales configurados</CardTitle>
            <CardDescription className="max-w-sm mx-auto mt-2">
              Agrega tu primer canal para que el bot pueda recibir mensajes
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-8">
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" />
              Agregar primer canal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {channels.map((ch) => {
            const info = CHANNEL_INFO[ch.channel_type] || {
              label: ch.channel_type,
              color: "bg-gray-500",
              icon: "📡",
              description: "",
              steps: [],
            };
            const isExpanded = expandedChannel === ch.id;
            const chType = ch.channel_type as string;
            const webhookUrl = chType === "whatsapp" || chType === "messenger"
              ? `${appUrl}/api/webhooks/meta`
              : chType === "tiktok"
                ? `${appUrl}/api/webhooks/tiktok`
                : ch.webhook_url;

            return (
              <Card key={ch.id} className={!ch.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${info.color} flex items-center justify-center text-lg`}>
                        {info.icon}
                      </div>
                      <div>
                        <CardTitle className="text-base">{info.label}</CardTitle>
                        {ch.display_name && ch.display_name !== info.label && (
                          <p className="text-xs text-muted-foreground">{ch.display_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ch.is_active ? "success" : "secondary"}>
                        {ch.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedChannel(isExpanded ? null : ch.id)}
                      >
                        {isExpanded ? "Cerrar" : "Detalles"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 pt-0">
                    {/* Setup wizard steps */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pasos de configuración</p>
                      <div className="space-y-2">
                        {info.steps.map((step, i) => {
                          const isCompleted = ch.is_active && i < 2;
                          return (
                            <div key={i} className="flex items-start gap-3 py-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                isCompleted ? "bg-green-500 text-white" : "border-2 border-muted-foreground/30"
                              }`}>
                                {isCompleted ? <Check className="w-3 h-3" /> : <Circle className="w-2 h-2" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                                  {step.title}
                                </p>
                                <p className="text-xs text-muted-foreground">{step.description}</p>
                                {step.link && !isCompleted && (
                                  <a
                                    href={step.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                                  >
                                    Abrir <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Separator />

                    {/* Connection actions */}
                    {(ch.channel_type === "whatsapp" || ch.channel_type === "messenger") && !ch.access_token && (
                      <div className="space-y-2">
                        <Button
                          onClick={() => handleConnectMeta(ch.channel_type as "whatsapp" | "messenger")}
                          className={ch.channel_type === "whatsapp" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}
                        >
                          <Globe className="w-4 h-4 mr-2" />
                          Conectar con Meta
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Se abrirá Facebook para que autorices la conexión. Requiere META_APP_ID configurado.
                        </p>
                      </div>
                    )}

                    {/* Webhook URL */}
                    {webhookUrl && ch.channel_type !== "web" && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Webhook URL</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-3 py-1.5 rounded flex-1 truncate font-mono">
                            {webhookUrl}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-8 w-8"
                            onClick={() => copyText(webhookUrl, "Webhook URL")}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Channel identifier */}
                    {ch.channel_identifier && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Identificador</p>
                        <p className="text-sm">{ch.channel_identifier}</p>
                      </div>
                    )}

                    {/* Provider config info */}
                    {ch.provider_config && Object.keys(ch.provider_config).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Configuración del proveedor</p>
                        <div className="bg-muted rounded-md p-2 text-xs font-mono space-y-0.5">
                          {Object.entries(ch.provider_config).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="truncate">{typeof val === "string" ? val.substring(0, 30) + (String(val).length > 30 ? "..." : "") : String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleToggle(ch)}
                        disabled={isPending}
                      >
                        {ch.is_active ? (
                          <><PowerOff className="w-3.5 h-3.5 mr-1" />Desactivar</>
                        ) : (
                          <><Power className="w-3.5 h-3.5 mr-1" />Activar</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(ch)}
                        disabled={isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add channel dialog */}
      <AddChannelDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        availableTypes={availableTypes}
        onCreated={(ch) => {
          setChannels((prev) => [...(prev || []), ch]);
          setShowAdd(false);
        }}
      />
    </div>
  );
}

function AddChannelDialog({
  open,
  onOpenChange,
  availableTypes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes: string[];
  onCreated: (ch: SocialChannel) => void;
}) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType) return;

    startTransition(async () => {
      const result = await createChannel({
        channel_type: selectedType as ChatChannel,
        display_name: displayName || CHANNEL_INFO[selectedType]?.label || selectedType,
        channel_identifier: identifier || undefined,
        webhook_secret: webhookSecret || undefined,
      });

      if (result.success && result.data) {
        toast.success(`Canal ${CHANNEL_INFO[selectedType]?.label} agregado`);
        onCreated(result.data);
        setSelectedType("");
        setDisplayName("");
        setIdentifier("");
        setWebhookSecret("");
      } else {
        toast.error(result.error || "Error al crear canal");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar canal</DialogTitle>
          <DialogDescription>
            Selecciona el canal que quieres conectar
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {availableTypes.map((type) => {
              const info = CHANNEL_INFO[type];
              if (!info) return null;
              return (
                <button
                  key={type}
                  type="button"
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedType === type
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedType(type)}
                >
                  <div className="text-lg mb-1">{info.icon}</div>
                  <p className="text-sm font-medium">{info.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {info.description}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedType && (
            <>
              {/* Steps preview */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Pasos de configuración:</p>
                {CHANNEL_INFO[selectedType]?.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="w-4 h-4 rounded-full border border-muted-foreground/30 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                      {i + 1}
                    </span>
                    <span>{step.title}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Nombre personalizado</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={CHANNEL_INFO[selectedType]?.label}
                />
              </div>

              {selectedType !== "web" && (
                <>
                  <div className="space-y-2">
                    <Label>Identificador del canal</Label>
                    <Input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={
                        selectedType === "whatsapp"
                          ? "+56912345678"
                          : selectedType === "messenger"
                            ? "ID de la página de Facebook"
                            : selectedType === "instagram"
                              ? "@mi_cuenta"
                              : "ID del canal"
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Webhook Secret (opcional)</Label>
                    <Input
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="clave-secreta-para-validar"
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!selectedType || isPending}>
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Agregar canal
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
