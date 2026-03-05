"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
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
  RefreshCw,
  Settings2,
  Zap,
  MessageCircle,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  Card,
  CardContent,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import {
  getChannels,
  createChannel,
  toggleChannel,
  deleteChannel,
  syncWhatsAppChannel,
  subscribeMetaWebhook,
  updateWhatsAppConfig,
  getWhatsAppPhoneNumbers,
  selectWhatsAppPhoneNumber,
} from "@/actions/channels";
import { getFeatureFlags, setFeatureFlag } from "@/actions/feature-flags";
import {
  WhatsAppIcon,
  MessengerIcon,
  InstagramIcon,
  TikTokIcon,
} from "@/components/ui/social-icons";
import { getAppUrl } from "@/lib/app-url";
import type { SocialChannel, ChatChannel } from "@/types";

const CHANNEL_INFO: Record<
  string,
  {
    label: string;
    gradient: string;
    accentColor: string;
    icon: ReactNode;
    description: string;
    steps: { title: string; description: string; link?: string }[];
  }
> = {
  web: {
    label: "Web Widget",
    gradient: "from-violet-500 to-purple-600",
    accentColor: "violet",
    icon: <Globe className="w-6 h-6 text-white" />,
    description: "Chat embebido en tu sitio web",
    steps: [
      { title: "Canal creado automáticamente", description: "El widget web está listo para usar" },
      { title: "Copia el código", description: "Ve a Configuración > Widget Web y copia el snippet" },
      { title: "Pégalo en tu sitio", description: "Agrega el <script> antes de </body>" },
    ],
  },
  whatsapp: {
    label: "WhatsApp",
    gradient: "from-green-500 to-emerald-600",
    accentColor: "green",
    icon: <WhatsAppIcon className="text-white" size={24} />,
    description: "Responder mensajes automáticamente",
    steps: [
      { title: "Cuenta WhatsApp Business", description: "Necesitas una cuenta de WhatsApp Business", link: "https://business.whatsapp.com/" },
      { title: "Conectar con Meta", description: "Vincula tu cuenta de WhatsApp con Meta Business Suite" },
      { title: "Verificar conexión", description: "Envía un mensaje de prueba para confirmar" },
    ],
  },
  messenger: {
    label: "Messenger",
    gradient: "from-blue-500 to-indigo-600",
    accentColor: "blue",
    icon: <MessengerIcon className="text-white" size={24} />,
    description: "Mensajes de Facebook Messenger y Marketplace",
    steps: [
      { title: "Página de Facebook", description: "Necesitas una Página de Facebook activa", link: "https://www.facebook.com/pages/create" },
      { title: "Conectar con Meta", description: "Vincula tu página para recibir mensajes" },
      { title: "Verificar conexión", description: "Envía un mensaje a tu página para probar" },
    ],
  },
  instagram: {
    label: "Instagram",
    gradient: "from-purple-500 via-pink-500 to-orange-400",
    accentColor: "pink",
    icon: <InstagramIcon className="text-white" size={24} />,
    description: "DMs y comentarios automáticos",
    steps: [
      { title: "Cuenta profesional", description: "Tu cuenta debe ser Profesional o Business", link: "https://help.instagram.com/502981923235522" },
      { title: "Conectar vía webhook", description: "Configura el webhook en tu integración" },
      { title: "Verificar conexión", description: "Envía un DM para probar" },
    ],
  },
  tiktok: {
    label: "TikTok",
    gradient: "from-gray-800 to-gray-950",
    accentColor: "gray",
    icon: <TikTokIcon className="text-white" size={24} />,
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
  business: { web: true, external: 3 },
  enterprise: { web: true, external: 99 },
  enterprise_plus: { web: true, external: 99 },
};

const CHANNELS_COMING_SOON: Partial<Record<ChatChannel, boolean>> = {
  tiktok: true,
};

export default function ChannelsPage() {
  const { tenant, tenantId } = useDashboard();
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<SocialChannel[] | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [whatsappPhones, setWhatsappPhones] = useState<Record<string, Array<{ id: string; display_phone_number: string }>>>({});
  const [selectedPhoneId, setSelectedPhoneId] = useState<Record<string, string>>({});
  const [metaTestTargets, setMetaTestTargets] = useState<Record<string, string>>({});
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [flagsPending, setFlagsPending] = useState(false);

  const plan = tenant?.plan_tier || "basic";
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.basic;
  const externalChannels = channels?.filter((c) => c.channel_type !== "web") || [];

  useEffect(() => {
    getChannels().then(setChannels).catch(() => setChannels([]));
    getFeatureFlags().then((r) => {
      if (r.success && r.data) setFeatureFlags(r.data);
    });
  }, []);

  useEffect(() => {
    if (searchParams.get("meta_success")) {
      getChannels().then(setChannels).catch(() => { });
      toast.success("Canal de Meta conectado. Si no ves el número, usa «Sincronizar número».");
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
        setActiveSheet(null);
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

  function encodeBase64Url(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function generateNonce(size = 24): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const random = new Uint8Array(size);
    crypto.getRandomValues(random);
    let out = "";
    for (let i = 0; i < random.length; i += 1) {
      out += alphabet[random[i] % alphabet.length];
    }
    return out;
  }

  function setOAuthNonceCookie(name: string, nonce: string) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${nonce}; Max-Age=900; Path=/; SameSite=Lax${secure}`;
  }

  function handleConnectMeta(channelType: "whatsapp" | "messenger" | "instagram") {
    const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
    if (!metaAppId) {
      toast.error("META_APP_ID no configurado. Agrega NEXT_PUBLIC_META_APP_ID en .env.local");
      return;
    }
    const appUrl = window.location.origin;
    const nonce = generateNonce();
    setOAuthNonceCookie("yd_oauth_nonce_meta", nonce);
    const stateJson = JSON.stringify({
      tenant_id: tenantId,
      channel_type: channelType,
      nonce,
      ts: Date.now(),
    });
    const state = encodeBase64Url(stateJson);
    const redirectUri = `${appUrl}/api/auth/meta/callback`;
    const scopes =
      channelType === "whatsapp"
        ? "email,public_profile,whatsapp_business_messaging,whatsapp_business_management,business_management"
        : channelType === "instagram"
          ? "email,public_profile,instagram_manage_messages,instagram_manage_comments,instagram_content_publish,instagram_basic,pages_manage_metadata,pages_show_list"
          : "email,public_profile,pages_messaging,pages_show_list,pages_read_engagement,business_management";

    const params = new URLSearchParams({
      client_id: metaAppId,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      response_type: "code",
    });

    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async function runMetaPermissionTest(channel: SocialChannel) {
    const isWhatsApp = channel.channel_type === "whatsapp";
    const isMessenger = channel.channel_type === "messenger";
    const isInstagram = channel.channel_type === "instagram";

    if (!isWhatsApp && !isMessenger && !isInstagram) return;

    const target = metaTestTargets[channel.id]?.trim() || "";
    if ((isWhatsApp || isMessenger) && !target) {
      toast.error(isWhatsApp ? "Ingresa numero de prueba (ej: 569...)." : "Ingresa user ID de prueba de Messenger.");
      return;
    }

    const endpoint = isWhatsApp
      ? `/api/channels/test-whatsapp-permissions?channelId=${channel.id}&testPhone=${encodeURIComponent(target)}`
      : isMessenger
        ? `/api/channels/test-messenger-permissions?channelId=${channel.id}&testPhone=${encodeURIComponent(target)}`
        : `/api/channels/test-ig-permissions?channelId=${channel.id}`;

    setTestingChannelId(channel.id);
    try {
      const res = await fetch(endpoint, { method: "GET" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo ejecutar la prueba de Meta.");
        return;
      }
      const successToast = isWhatsApp
        ? "Prueba de WhatsApp ejecutada correctamente."
        : isMessenger
          ? "Prueba de Messenger ejecutada correctamente."
          : "Prueba de Instagram ejecutada correctamente.";
      toast.success(successToast);
      const nextChannels = await getChannels();
      setChannels(nextChannels);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo ejecutar la prueba de Meta.");
    } finally {
      setTestingChannelId(null);
    }
  }

  async function handleFlagToggle(flag: string, enabled: boolean) {
    setFlagsPending(true);
    const prev = { ...featureFlags };
    setFeatureFlags((f) => ({ ...f, [flag]: enabled }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await setFeatureFlag(flag as any, enabled);
    if (!result.success) {
      setFeatureFlags(prev);
      toast.error(result.error ?? "Error al actualizar");
    } else {
      if (result.data) setFeatureFlags(result.data);
      toast.success(enabled ? "Activado" : "Desactivado");
    }
    setFlagsPending(false);
  }

  if (channels === undefined) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Cargando canales...</p>
        </div>
      </div>
    );
  }

  const usedTypes = new Set(channels.map((c) => c.channel_type as string));
  const availableTypes = Object.keys(CHANNEL_INFO).filter((t) => {
    if (CHANNELS_COMING_SOON[t as ChatChannel]) return false;
    if (usedTypes.has(t)) return false;
    if (t !== "web" && limits.external <= externalChannels.length) return false;
    return true;
  });
  const comingSoonTypes = Object.keys(CHANNEL_INFO).filter(
    (t) => CHANNELS_COMING_SOON[t as ChatChannel] && !usedTypes.has(t)
  );
  const canOpenAddDialog = availableTypes.length > 0 || comingSoonTypes.length > 0;

  const appUrl = getAppUrl();
  const activeChannel = channels.find((c) => c.id === activeSheet);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            Canales
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Conecta plataformas para que tu bot atienda en múltiples canales
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Plan badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border/50 text-xs text-muted-foreground">
            <span className="font-medium capitalize text-foreground">{plan}</span>
            <span>·</span>
            <span>{externalChannels.length}/{limits.external === 99 ? "∞" : limits.external} externos</span>
          </div>

          {canOpenAddDialog && (
            <Button onClick={() => setShowAdd(true)} className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              Agregar canal
            </Button>
          )}
        </div>
      </div>

      {/* Channel grid */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-2xl bg-muted/20">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="font-semibold text-lg">Sin canales configurados</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            Agrega tu primer canal para que el bot pueda recibir y responder mensajes
          </p>
          <Button onClick={() => setShowAdd(true)} className="mt-6 gap-2">
            <Plus className="w-4 h-4" />
            Agregar primer canal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => {
            const info = CHANNEL_INFO[ch.channel_type] || {
              label: ch.channel_type,
              gradient: "from-gray-500 to-gray-600",
              accentColor: "gray",
              icon: <MessageSquare className="w-6 h-6 text-white" />,
              description: "",
              steps: [],
            };

            return (
              <button
                key={ch.id}
                onClick={() => setActiveSheet(ch.id)}
                className="group relative text-left rounded-2xl border border-border/60 bg-card overflow-hidden hover:border-border hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              >
                {/* Top gradient band */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${info.gradient}`} />

                <div className="p-5">
                  {/* Icon + status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${info.gradient} flex items-center justify-center shadow-sm`}>
                      {info.icon}
                    </div>
                    <div className="flex items-center gap-2">
                      {ch.is_active ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Activo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Channel name */}
                  <div>
                    <h3 className="font-semibold text-sm">{info.label}</h3>
                    {ch.display_name && ch.display_name !== info.label && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{ch.display_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                      {info.description}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                    <div className="flex items-center gap-1.5">
                      {ch.access_token && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-500" />
                          Conectado
                        </span>
                      )}
                      {ch.channel_type === "instagram" && featureFlags.instagram_comments_enabled && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 h-4">
                          <Zap className="w-2.5 h-2.5" />
                          Auto
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}

          {/* Add channel card (if slots available) */}
          {canOpenAddDialog && (
            <button
              onClick={() => setShowAdd(true)}
              className="group relative text-left rounded-2xl border-2 border-dashed border-border/40 bg-muted/10 overflow-hidden hover:border-border hover:bg-muted/20 transition-all duration-200 active:scale-[0.98] min-h-[160px] flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors p-5">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Agregar canal</span>
                <span className="text-xs opacity-70">
                  {availableTypes.length} disponible{availableTypes.length !== 1 ? "s" : ""}
                  {comingSoonTypes.length > 0 ? ` • ${comingSoonTypes.length} proximamente` : ""}
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Channel detail sheet */}
      <Sheet open={!!activeSheet} onOpenChange={(open) => !open && setActiveSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {activeChannel && (() => {
            const ch = activeChannel;
            const info = CHANNEL_INFO[ch.channel_type] || {
              label: ch.channel_type,
              gradient: "from-gray-500 to-gray-600",
              accentColor: "gray",
              icon: <MessageSquare className="w-6 h-6 text-white" />,
              description: "",
              steps: [],
            };
            const chType = ch.channel_type as string;
            const webhookUrl =
              chType === "whatsapp" || chType === "messenger" || chType === "instagram"
                ? `${appUrl}/api/webhooks/meta`
                : chType === "tiktok"
                  ? `${appUrl}/api/webhooks/tiktok`
                  : ch.webhook_url;
            const metaReviewKey =
              chType === "whatsapp"
                ? "whatsapp_permissions"
                : chType === "messenger"
                  ? "messenger_permissions"
                  : chType === "instagram"
                    ? "instagram_permissions"
                    : null;
            const metaReviewData = metaReviewKey
              ? ((((ch.config as Record<string, unknown> | undefined)?.meta_review as Record<string, unknown> | undefined)?.[metaReviewKey]) as
                | { last_test_at?: string; success?: boolean }
                | undefined)
              : undefined;

            return (
              <div className="flex flex-col gap-6 pb-8">
                <SheetHeader className="pb-0">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${info.gradient} flex items-center justify-center shadow-md`}>
                      {info.icon}
                    </div>
                    <div>
                      <SheetTitle className="text-xl">{info.label}</SheetTitle>
                      <SheetDescription className="mt-0.5">{info.description}</SheetDescription>
                    </div>
                  </div>

                  {/* Status pill */}
                  <div className="flex items-center gap-2 mt-2">
                    {ch.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                        Inactivo
                      </span>
                    )}
                    {ch.access_token && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-xs border border-blue-200 dark:border-blue-800">
                        <Check className="w-3 h-3" />
                        Meta conectado
                      </span>
                    )}
                  </div>
                </SheetHeader>

                <Separator />

                {/* Instagram Automation Section */}
                {ch.channel_type === "instagram" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="font-semibold text-sm">Automatización de Instagram</h3>
                    </div>

                    {/* Comments automation toggle */}
                    <div className="rounded-xl border border-border/60 overflow-hidden">
                      <div className="p-4 bg-muted/20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <MessageCircle className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">Respuesta automática a comentarios</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                El bot clasifica los comentarios públicos y los enruta automáticamente (DM, respuesta o handoff a agente).
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={featureFlags.instagram_comments_enabled === true}
                            disabled={flagsPending}
                            onClick={() => handleFlagToggle("instagram_comments_enabled", !featureFlags.instagram_comments_enabled)}
                            className="flex-shrink-0 mt-0.5"
                          >
                            {featureFlags.instagram_comments_enabled ? (
                              <ToggleRight className="w-8 h-8 text-pink-500" />
                            ) : (
                              <ToggleLeft className="w-8 h-8 text-muted-foreground/40" />
                            )}
                          </button>
                        </div>

                        {featureFlags.instagram_comments_enabled && (
                          <div className="mt-3 pt-3 border-t border-border/40">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border border-pink-200 dark:border-pink-900">
                                Confianza mínima: 60%
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900">
                                Acción: Abrir DM
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                                Baja confianza → Handoff
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Setup steps */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-sm">Configuración</h3>
                  </div>
                  <div className="space-y-2">
                    {info.steps.map((step, i) => {
                      const isCompleted = ch.is_active && i < 2;
                      return (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${isCompleted
                            ? "bg-emerald-500 text-white"
                            : "border-2 border-muted-foreground/30 text-muted-foreground"
                            }`}>
                            {isCompleted ? <Check className="w-3 h-3" /> : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                              {step.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                            {step.link && !isCompleted && (
                              <a
                                href={step.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                              >
                                Abrir enlace <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Connection actions */}
                {(ch.channel_type === "whatsapp" || ch.channel_type === "messenger" || ch.channel_type === "instagram") && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      Conexión Meta
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => handleConnectMeta(ch.channel_type as "whatsapp" | "messenger" | "instagram")}
                        className={
                          ch.channel_type === "whatsapp"
                            ? "bg-green-600 hover:bg-green-700"
                            : ch.channel_type === "instagram"
                              ? "bg-pink-600 hover:bg-pink-700"
                              : "bg-blue-600 hover:bg-blue-700"
                        }
                        size="sm"
                      >
                        <Globe className="w-4 h-4 mr-1.5" />
                        {ch.access_token ? "Reconectar con Meta" : "Conectar con Meta"}
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                      {ch.channel_type === "whatsapp" && ch.access_token && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await syncWhatsAppChannel(ch.id);
                              if (result.success) {
                                getChannels().then(setChannels);
                                toast.success(result.data?.phone_number_id ? "Número sincronizado" : "Sincronizado. Usa el formulario si no aparece el número.");
                              } else {
                                toast.error(result.error || "Error al sincronizar");
                              }
                            });
                          }}
                        >
                          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                          Sincronizar número
                        </Button>
                      )}
                    </div>

                    {/* WhatsApp number selector */}
                    {ch.channel_type === "whatsapp" && ch.access_token && !(ch.provider_config as Record<string, string>)?.phone_number_id && (
                      <div className="p-4 rounded-xl border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/30 space-y-3">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                          Selecciona el número de WhatsApp Business a usar
                        </p>
                        {(ch.provider_config as Record<string, string>)?.waba_id ? (
                          <div className="flex flex-col gap-2">
                            {!whatsappPhones[ch.id] ? (
                              <Button type="button" variant="outline" size="sm" disabled={isPending} className="h-8 w-fit"
                                onClick={() => {
                                  startTransition(async () => {
                                    const result = await getWhatsAppPhoneNumbers(ch.id);
                                    if (result.success && result.data) {
                                      setWhatsappPhones((prev) => ({ ...prev, [ch.id]: result.data! }));
                                      if (result.data.length === 1) setSelectedPhoneId((prev) => ({ ...prev, [ch.id]: result.data![0].id }));
                                    } else {
                                      toast.error(result.error || "No se pudieron cargar los números");
                                    }
                                  });
                                }}
                              >
                                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cargar números"}
                              </Button>
                            ) : (
                              <div className="flex gap-2">
                                <select
                                  value={selectedPhoneId[ch.id] || ""}
                                  onChange={(e) => setSelectedPhoneId((prev) => ({ ...prev, [ch.id]: e.target.value }))}
                                  className="flex h-8 flex-1 rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                  <option value="">Selecciona un número</option>
                                  {whatsappPhones[ch.id].map((p) => (
                                    <option key={p.id} value={p.id}>{p.display_phone_number}</option>
                                  ))}
                                </select>
                                <Button type="button" size="sm" disabled={isPending || !selectedPhoneId[ch.id]} className="h-8"
                                  onClick={() => {
                                    startTransition(async () => {
                                      const pid = selectedPhoneId[ch.id];
                                      if (!pid) return;
                                      const result = await selectWhatsAppPhoneNumber(ch.id, pid);
                                      if (result.success) {
                                        getChannels().then(setChannels);
                                        toast.success("Número configurado");
                                        setWhatsappPhones((prev) => { const n = { ...prev }; delete n[ch.id]; return n; });
                                        setSelectedPhoneId((prev) => { const n = { ...prev }; delete n[ch.id]; return n; });
                                      } else {
                                        toast.error(result.error || "Error al guardar");
                                      }
                                    });
                                  }}
                                >
                                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar"}
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <form className="space-y-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = e.target as HTMLFormElement;
                              const phoneId = (form.elements.namedItem("wa_phone_id") as HTMLInputElement).value;
                              const wabaIdVal = (form.elements.namedItem("wa_waba_id") as HTMLInputElement).value;
                              if (!phoneId || !wabaIdVal) { toast.error("Ambos campos son obligatorios"); return; }
                              startTransition(async () => {
                                const result = await updateWhatsAppConfig(ch.id, phoneId, wabaIdVal);
                                if (result.success) {
                                  getChannels().then(setChannels);
                                  toast.success("WhatsApp configurado");
                                } else {
                                  toast.error(result.error || "Error al guardar");
                                }
                              });
                            }}
                          >
                            <p className="text-xs text-muted-foreground">
                              Copia los IDs desde{" "}
                              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline">Meta Developers</a>
                              {" "}→ WhatsApp → Configuración de la API.
                            </p>
                            <div className="flex gap-2">
                              <Input name="wa_phone_id" placeholder="Phone Number ID" className="text-xs h-8 flex-1" />
                              <Input name="wa_waba_id" placeholder="WABA ID" className="text-xs h-8 flex-1" />
                            </div>
                            <Button type="submit" size="sm" disabled={isPending} className="h-8">
                              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar"}
                            </Button>
                          </form>
                        )}
                      </div>
                    )}

                    {/* Messenger/Instagram webhook subscribe */}
                    {(ch.channel_type === "messenger" || ch.channel_type === "instagram") && ch.access_token && (
                      <Button variant="outline" size="sm" disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await subscribeMetaWebhook(ch.id);
                            if (result.success) {
                              toast.success("Webhook suscrito en Meta.");
                            } else {
                              toast.error(result.error || "Error al suscribir webhook");
                            }
                          });
                        }}
                      >
                        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                        Suscribir Webhook
                      </Button>
                    )}

                    {/* Meta permission test */}
                    {metaReviewKey && (
                      <div className="space-y-2 rounded-xl border border-dashed p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          App Review Meta — prueba de permisos
                        </p>
                        {(ch.channel_type === "whatsapp" || ch.channel_type === "messenger") && (
                          <Input
                            value={metaTestTargets[ch.id] || ""}
                            onChange={(e) => setMetaTestTargets((prev) => ({ ...prev, [ch.id]: e.target.value }))}
                            placeholder={ch.channel_type === "whatsapp" ? "Numero prueba (569...)" : "User ID de Messenger"}
                            className="h-8 text-xs"
                          />
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={testingChannelId === ch.id} onClick={() => void runMetaPermissionTest(ch)}>
                            {testingChannelId === ch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                            Ejecutar prueba Meta
                          </Button>
                          {metaReviewData?.last_test_at ? (
                            <Badge variant={metaReviewData.success ? "success" : "warning"}>
                              {metaReviewData.success ? "OK" : "Con error"}: {new Date(metaReviewData.last_test_at).toLocaleString("es-CL")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Sin evidencia guardada</Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {ch.access_token
                        ? ch.channel_type === "whatsapp"
                          ? "Si los IDs no se obtuvieron automáticamente, completa el formulario con los datos de Meta Developers."
                          : "Si configuraste el canal en Meta, usa «Suscribir Webhook» para conectarlos."
                        : "Se abrirá Facebook para que autorices la conexión. Requiere META_APP_ID configurado."}
                    </p>
                  </div>
                )}

                {/* Webhook URL */}
                {webhookUrl && ch.channel_type !== "web" && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">Webhook URL</h3>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-3 py-2 rounded-lg flex-1 min-w-0 truncate font-mono block border border-border/50">
                        {webhookUrl}
                      </code>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => copyText(webhookUrl, "Webhook URL")}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Identifier */}
                {ch.channel_identifier && (
                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm text-muted-foreground">Identificador</h3>
                    <p className="text-sm">{ch.channel_identifier}</p>
                  </div>
                )}

                {/* Provider config */}
                {ch.provider_config && Object.keys(ch.provider_config).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">Configuración del proveedor</h3>
                    <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono space-y-1 border border-border/40">
                      {Object.entries(ch.provider_config).map(([key, val]) => (
                        <div key={key} className="flex gap-2 min-w-0">
                          <span className="text-muted-foreground shrink-0">{key}:</span>
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
                      <><PowerOff className="w-3.5 h-3.5 mr-1.5" />Desactivar canal</>
                    ) : (
                      <><Power className="w-3.5 h-3.5 mr-1.5" />Activar canal</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
                    onClick={() => handleDelete(ch)}
                    disabled={isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Add channel dialog */}
      <AddChannelDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        availableTypes={availableTypes}
        comingSoonTypes={comingSoonTypes}
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
  comingSoonTypes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes: string[];
  comingSoonTypes: string[];
  onCreated: (ch: SocialChannel) => void;
}) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-left">Agregar canal</DialogTitle>
          <DialogDescription className="text-left">
            Selecciona el canal que quieres conectar
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableTypes.map((type) => {
              const info = CHANNEL_INFO[type];
              if (!info) return null;
              return (
                <button
                  key={type}
                  type="button"
                  className={`p-4 rounded-xl border-2 text-left transition-all duration-150 ${selectedType === type
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border/60 hover:border-border"
                    }`}
                  onClick={() => setSelectedType(type)}
                >
                  <div className={`w-10 h-10 mb-3 flex items-center justify-center rounded-xl bg-gradient-to-br ${info.gradient} shadow-sm`}>
                    {info.icon}
                  </div>
                  <p className="text-sm font-semibold">{info.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {info.description}
                  </p>
                </button>
              );
            })}
            {comingSoonTypes.map((type) => {
              const info = CHANNEL_INFO[type];
              if (!info) return null;
              return (
                <div
                  key={type}
                  className="p-4 rounded-xl border-2 border-dashed border-border/50 bg-muted/20 text-left opacity-80 cursor-not-allowed"
                  aria-disabled="true"
                >
                  <div className={`w-10 h-10 mb-3 flex items-center justify-center rounded-xl bg-gradient-to-br ${info.gradient} shadow-sm`}>
                    {info.icon}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{info.label}</p>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      Proximamente
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {info.description}
                  </p>
                </div>
              );
            })}
          </div>

          {selectedType && (
            <>
              <div className="bg-muted/40 rounded-xl p-3 space-y-2 border border-border/40">
                <p className="text-xs font-medium text-muted-foreground">Pasos de configuración:</p>
                {CHANNEL_INFO[selectedType]?.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="w-4 h-4 rounded-full border border-muted-foreground/30 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step.title}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>
                  Nombre personalizado <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={CHANNEL_INFO[selectedType]?.label}
                />
                <p className="text-xs text-muted-foreground">
                  Si lo dejas vacío se usará el nombre del canal.
                </p>
              </div>

              {selectedType !== "web" && (
                <>
                  <div className="space-y-1.5">
                    <Label>
                      Identificador del canal <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Ej: +56912345678"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      Webhook Secret <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="Para validar requests del webhook"
                      type="password"
                    />
                  </div>
                </>
              )}

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creando...</>
                ) : (
                  <>Agregar {CHANNEL_INFO[selectedType]?.label}</>
                )}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
