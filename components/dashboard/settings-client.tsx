"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  CreditCard,
  Zap,
  Crown,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Bot,
  Building2,
  Globe,
  MessageCircle,
  Mail,
  Phone,
  FileText,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getAppUrl } from "@/lib/app-url";
import { updateBankDetails, updateTenant, disconnectMP } from "@/actions/tenant";
import {
  getIntegrationSettings,
  disconnectGmailIntegration,
  saveN8nIntegration,
  saveResendIntegration,
  saveSmtpIntegration,
} from "@/actions/integrations";
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  toggleMcpServer,
  type McpServer,
} from "@/actions/mcp-servers";
import { normalizeBaseUrl } from "@/lib/app-url";
import type {
  Tenant,
  BusinessType,
  ContactAction,
  BotTone,
} from "@/types";

type McpAuthType = "none" | "api_key" | "bearer" | "basic" | "custom_header";

interface SettingsClientProps {
  tenant: Tenant | null;
  userRole: string;
  mpSuccess?: boolean;
  mpError?: string;
  gmailSuccess?: boolean;
  gmailError?: string;
}

const mpErrorMessages: Record<string, string> = {
  missing_params: "Parámetros incompletos en la respuesta de Mercado Pago",
  invalid_state: "Estado de autorización inválido",
  token_exchange_failed: "No se pudo obtener el token de acceso",
  db_error: "Error al guardar los tokens en la base de datos",
};

const gmailErrorMessages: Record<string, string> = {
  missing_params: "Parametros incompletos en la respuesta de Google",
  invalid_state: "Estado de autorizacion invalido",
  unauthorized_state: "La sesion no coincide con el tenant autorizado",
  config_missing: "Falta configurar GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
  token_exchange_failed: "No se pudo obtener el token de Google",
  userinfo_failed: "No se pudo leer el email de la cuenta Google",
  no_refresh_token: "Google no devolvio refresh token (reintenta reconectar)",
  db_error: "Error al guardar la integracion de Gmail",
  access_denied: "Autorizacion cancelada por el usuario",
};

export function SettingsClient({
  tenant,
  userRole,
  mpSuccess,
  mpError,
  gmailSuccess,
  gmailError,
}: SettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estado del formulario general
  const [generalForm, setGeneralForm] = useState({
    name: tenant?.name || "",
    business_name: tenant?.business_name || "",
    business_type: (tenant?.business_type || "products") as BusinessType,
    business_description: tenant?.business_description || "",
    business_address: tenant?.business_address || "",
    contact_action: (tenant?.contact_action || "payment_link") as ContactAction,
    contact_whatsapp: tenant?.contact_whatsapp || "",
    contact_email: tenant?.contact_email || "",
    contact_custom_message: tenant?.contact_custom_message || "",
    bot_name: tenant?.bot_name || "Asistente",
    bot_welcome_message: tenant?.bot_welcome_message || "¡Hola! ¿En qué puedo ayudarte?",
    bot_tone: (tenant?.bot_tone || "amigable") as BotTone,
  });

  // Estado datos bancarios
  const [bankDetails, setBankDetails] = useState(tenant?.bank_details || "");

  // Estado Enterprise
  const [enterpriseForm, setEnterpriseForm] = useState({
    white_label_name: tenant?.white_label_name || "",
    white_label_domain: tenant?.white_label_domain || "",
    white_label_logo: tenant?.white_label_logo || "",
  });
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [isMcpLoading, setIsMcpLoading] = useState(false);
  const [mcpForm, setMcpForm] = useState({
    name: "",
    url: "",
    auth_type: "none" as McpAuthType,
    auth_secret: "",
  });
  const [isIntegrationsLoading, setIsIntegrationsLoading] = useState(false);
  const [resendForm, setResendForm] = useState({
    is_active: false,
    from_email: "",
    api_key: "",
    has_api_key: false,
  });
  const [n8nForm, setN8nForm] = useState({
    is_active: false,
    webhook_url: "",
    auth_header: "",
    has_auth_header: false,
  });
  const [smtpForm, setSmtpForm] = useState({
    is_active: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    from_email: "",
    password: "",
    has_password: false,
  });
  const [gmailOAuthForm, setGmailOAuthForm] = useState({
    is_active: false,
    email: "",
    has_refresh_token: false,
  });
  const [selectedConnector, setSelectedConnector] = useState<"gmail_oauth" | "smtp" | "resend" | "n8n" | null>(null);

  // Mostrar notificaciones de MP OAuth
  useEffect(() => {
    if (mpSuccess) {
      toast.success("¡Mercado Pago conectado exitosamente!");
      router.replace("/dashboard/settings");
    }
    if (mpError) {
      toast.error(mpErrorMessages[mpError] || `Error de MP: ${mpError}`);
      router.replace("/dashboard/settings");
    }
    if (gmailSuccess) {
      toast.success("Gmail conectado exitosamente");
      router.replace("/dashboard/settings");
    }
    if (gmailError) {
      toast.error(gmailErrorMessages[gmailError] || `Error de Gmail: ${gmailError}`);
      router.replace("/dashboard/settings");
    }
  }, [mpSuccess, mpError, gmailSuccess, gmailError, router]);

  const isOwner = userRole === "owner";
  const plan = tenant?.plan_tier || "basic";
  const isMPConnected = !!tenant?.mp_user_id;

  async function loadMcpServers() {
    if (plan !== "enterprise") return;
    setIsMcpLoading(true);
    try {
      const items = await listMcpServers();
      setMcpServers(items.data || []);
    } finally {
      setIsMcpLoading(false);
    }
  }

  useEffect(() => {
    void loadMcpServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, tenant?.id]);

  async function loadTenantIntegrations() {
    if (!tenant?.id) return;
    setIsIntegrationsLoading(true);
    try {
      const settings = await getIntegrationSettings();
      setResendForm((prev) => ({
        ...prev,
        is_active: settings.resend.is_active,
        from_email: settings.resend.from_email || "",
        api_key: "",
        has_api_key: settings.resend.has_api_key,
      }));
      setN8nForm((prev) => ({
        ...prev,
        is_active: settings.n8n.is_active,
        webhook_url: settings.n8n.webhook_url || "",
        auth_header: "",
        has_auth_header: settings.n8n.has_auth_header,
      }));
      setSmtpForm((prev) => ({
        ...prev,
        is_active: settings.smtp.is_active,
        host: settings.smtp.host || "",
        port: settings.smtp.port || 587,
        secure: Boolean(settings.smtp.secure),
        user: settings.smtp.user || "",
        from_email: settings.smtp.from_email || "",
        password: "",
        has_password: settings.smtp.has_password,
      }));
      setGmailOAuthForm((prev) => ({
        ...prev,
        is_active: settings.gmail_oauth.is_active,
        email: settings.gmail_oauth.email || "",
        has_refresh_token: settings.gmail_oauth.has_refresh_token,
      }));
    } finally {
      setIsIntegrationsLoading(false);
    }
  }

  useEffect(() => {
    void loadTenantIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  function encodeBase64Url(value: string): string {
    if (typeof window === "undefined") return value;
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return window
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function generateNonce(size = 24): string {
    if (typeof window === "undefined") return "nonce";
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const random = new Uint8Array(size);
    window.crypto.getRandomValues(random);
    let out = "";
    for (let i = 0; i < random.length; i += 1) out += alphabet[random[i] % alphabet.length];
    return out;
  }

  function setOAuthNonceCookie(name: string, nonce: string) {
    if (typeof window === "undefined") return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${nonce}; Max-Age=900; Path=/; SameSite=Lax${secure}`;
  }

  function handleConnectMP() {
    if (!tenant?.id) return;
    // El tenant_id se pasa como state en base64url
    const nonce = generateNonce();
    setOAuthNonceCookie("yd_oauth_nonce_mp", nonce);
    const state = encodeBase64Url(
      JSON.stringify({ tenant_id: tenant.id, nonce, ts: Date.now() })
    );
    const clientId = process.env.NEXT_PUBLIC_MP_CLIENT_ID || "";
    const appUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL || window.location.origin);
    const redirectUri = `${appUrl}/api/auth/mercadopago/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      platform_id: "mp",
      redirect_uri: redirectUri,
      state,
    });

    window.location.href = `https://auth.mercadopago.cl/authorization?${params.toString()}`;
  }

  function handleConnectGmail() {
    if (!tenant?.id) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      toast.error("Falta NEXT_PUBLIC_GOOGLE_CLIENT_ID en el entorno");
      return;
    }

    const nonce = generateNonce();
    setOAuthNonceCookie("yd_oauth_nonce_gmail", nonce);
    const state = encodeBase64Url(
      JSON.stringify({ tenant_id: tenant.id, nonce, ts: Date.now() })
    );
    const appUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL || window.location.origin);
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "openid email profile https://mail.google.com/",
      state,
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  function handleDisconnectGmail() {
    if (!isOwner) return;
    startTransition(async () => {
      const result = await disconnectGmailIntegration();
      if (!result.success) {
        toast.error(result.error || "No se pudo desconectar Gmail");
        return;
      }
      toast.success("Gmail desconectado");
      await loadTenantIntegrations();
    });
  }

  function saveGeneral() {
    startTransition(async () => {
      const result = await updateTenant(generalForm);
      if (result.success) {
        toast.success("Configuración guardada");
      } else {
        toast.error(result.error || "Error al guardar");
      }
    });
  }

  function saveBankDetails() {
    startTransition(async () => {
      const result = await updateBankDetails(bankDetails);
      if (result.success) {
        toast.success("Datos bancarios guardados");
      } else {
        toast.error(result.error || "Error al guardar");
      }
    });
  }

  function saveEnterprise() {
    startTransition(async () => {
      const result = await updateTenant(enterpriseForm);
      if (result.success) {
        toast.success("Configuración Enterprise guardada");
      } else {
        toast.error(result.error || "Error al guardar");
      }
    });
  }

  function handleDisconnectMP() {
    startTransition(async () => {
      const result = await disconnectMP();
      if (result.success) {
        toast.success("Mercado Pago desconectado");
      } else {
        toast.error(result.error || "Error al desconectar");
      }
    });
  }

  function createEnterpriseMcpServer() {
    if (!isOwner) return;

    startTransition(async () => {
      const result = await createMcpServer({
        name: mcpForm.name,
        url: mcpForm.url,
        auth_type: mcpForm.auth_type,
        auth_secret: mcpForm.auth_type === "none" ? "" : mcpForm.auth_secret,
      });

      if (!result.success) {
        toast.error(result.error || "No se pudo crear el servidor MCP");
        return;
      }

      toast.success("Servidor MCP creado");
      setMcpForm({ name: "", url: "", auth_type: "none", auth_secret: "" });
      await loadMcpServers();
    });
  }

  function toggleMcpServerStatus(server: McpServer) {
    if (!isOwner) return;
    startTransition(async () => {
      const result = await toggleMcpServer(server.id, !server.is_active);

      if (!result.success) {
        toast.error(result.error || "No se pudo actualizar");
        return;
      }

      toast.success(server.is_active ? "Servidor desactivado" : "Servidor activado");
      await loadMcpServers();
    });
  }

  function removeMcpServer(server: McpServer) {
    if (!isOwner) return;
    startTransition(async () => {
      const result = await deleteMcpServer(server.id);
      if (!result.success) {
        toast.error(result.error || "No se pudo eliminar");
        return;
      }

      toast.success("Servidor MCP eliminado");
      await loadMcpServers();
    });
  }

  function saveResendSettings() {
    if (!isOwner) return;
    startTransition(async () => {
      const result = await saveResendIntegration({
        is_active: resendForm.is_active,
        from_email: resendForm.from_email,
        api_key: resendForm.api_key || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "No se pudo guardar Resend");
        return;
      }

      toast.success("Integracion Resend guardada");
      await loadTenantIntegrations();
    });
  }

  function saveN8nSettings() {
    if (!isOwner) return;
    startTransition(async () => {
      const result = await saveN8nIntegration({
        is_active: n8nForm.is_active,
        webhook_url: n8nForm.webhook_url,
        auth_header: n8nForm.auth_header || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "No se pudo guardar n8n");
        return;
      }

      toast.success("Integracion n8n guardada");
      await loadTenantIntegrations();
    });
  }

  function saveSmtpSettings() {
    if (!isOwner) return;
    startTransition(async () => {
      const result = await saveSmtpIntegration({
        is_active: smtpForm.is_active,
        host: smtpForm.host,
        port: smtpForm.port,
        secure: smtpForm.secure,
        user: smtpForm.user,
        from_email: smtpForm.from_email,
        password: smtpForm.password || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "No se pudo guardar SMTP");
        return;
      }

      toast.success("Integracion SMTP guardada");
      await loadTenantIntegrations();
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Configuración
        </h1>
        <p className="text-muted-foreground mt-1">
          Administra tu cuenta, plan y métodos de pago
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="inline-flex w-full flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          {plan === "enterprise" && (
            <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
          )}
        </TabsList>

        {/* === TAB: GENERAL === */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-4 h-4" />
                Datos del negocio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Tu nombre</Label>
                  <Input
                    id="name"
                    value={generalForm.name}
                    onChange={(e) =>
                      setGeneralForm((f) => ({ ...f, name: e.target.value }))
                    }
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_name">Nombre del negocio</Label>
                  <Input
                    id="business_name"
                    value={generalForm.business_name}
                    onChange={(e) =>
                      setGeneralForm((f) => ({
                        ...f,
                        business_name: e.target.value,
                      }))
                    }
                    disabled={!isOwner}
                  />
                </div>
              </div>

              <Separator />

              {/* Tipo de Negocio */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Tipo de negocio</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                  {([
                    { id: "products" as const, label: "Productos", desc: "Venta de productos físicos o digitales" },
                    { id: "services" as const, label: "Servicios", desc: "Arriendos, reservas, tours" },
                    { id: "professional" as const, label: "Profesional", desc: "Abogados, consultores, médicos" },
                    { id: "mixed" as const, label: "Mixto", desc: "Productos y servicios" },
                  ]).map((bt) => (
                    <button
                      key={bt.id}
                      type="button"
                      disabled={!isOwner}
                      className={`p-3 rounded-lg border text-left transition-colors ${generalForm.business_type === bt.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                        }`}
                      onClick={() => setGeneralForm((f) => ({ ...f, business_type: bt.id }))}
                    >
                      <p className="text-sm font-medium">{bt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{bt.desc}</p>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_desc">Descripción del negocio (opcional)</Label>
                  <Textarea
                    id="business_desc"
                    value={generalForm.business_description}
                    onChange={(e) => setGeneralForm((f) => ({ ...f, business_description: e.target.value }))}
                    placeholder="Ej: Arriendo de cabañas en el sur de Chile, bufete especializado en derecho civil..."
                    disabled={!isOwner}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_address">Dirección del negocio (opcional)</Label>
                  <Input
                    id="business_address"
                    value={generalForm.business_address}
                    onChange={(e) => setGeneralForm((f) => ({ ...f, business_address: e.target.value }))}
                    placeholder="Ej: Av. Principal 123, Santiago"
                    disabled={!isOwner}
                  />
                  <p className="text-xs text-muted-foreground">El bot podrá compartir esta dirección cuando los clientes la soliciten.</p>
                </div>
              </div>

              <Separator />

              {/* Acción de contacto */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Cuando un cliente quiere comprar/reservar/contratar</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    {
                      id: "payment_link" as const,
                      label: plan === "basic" ? "Datos de transferencia" : "Link de pago",
                      desc:
                        plan === "basic"
                          ? "El bot entregará los datos bancarios configurados"
                          : isMPConnected
                            ? "Genera link de Mercado Pago automático"
                            : "Usa datos bancarios (configúralos en Pagos). El bot SIEMPRE compartirá los datos cuando el cliente pida transferir.",
                      icon: CreditCard,
                    },
                    { id: "whatsapp_contact" as const, label: "Contacto WhatsApp", desc: "Envía al WhatsApp del dueño", icon: Phone },
                    { id: "email_contact" as const, label: "Contacto Email", desc: "Envía al email del negocio", icon: Mail },
                    { id: "custom_message" as const, label: "Mensaje personalizado", desc: "Muestra un mensaje custom", icon: FileText },
                  ]).map((ca) => (
                    <button
                      key={ca.id}
                      type="button"
                      disabled={!isOwner}
                      className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-3 ${generalForm.contact_action === ca.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                        }`}
                      onClick={() => setGeneralForm((f) => ({ ...f, contact_action: ca.id }))}
                    >
                      <ca.icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{ca.label}</p>
                        <p className="text-xs text-muted-foreground">{ca.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {generalForm.contact_action === "payment_link" &&
                  !bankDetails.trim() &&
                  (plan === "basic" || !isMPConnected) && (
                    <div className="flex gap-2 p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="text-sm">
                        El bot no podrá compartir datos de transferencia hasta que configures los datos bancarios en la pestaña{" "}
                        <strong>Pagos</strong>.
                      </p>
                    </div>
                  )}

                {generalForm.contact_action === "whatsapp_contact" && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_wa">Número de WhatsApp</Label>
                    <Input
                      id="contact_wa"
                      value={generalForm.contact_whatsapp}
                      onChange={(e) => setGeneralForm((f) => ({ ...f, contact_whatsapp: e.target.value }))}
                      placeholder="+56912345678"
                      disabled={!isOwner}
                    />
                    <p className="text-xs text-muted-foreground">El bot enviará este link: wa.me/{generalForm.contact_whatsapp.replace(/[^0-9]/g, "")}</p>
                  </div>
                )}
                {generalForm.contact_action === "email_contact" && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Email de contacto</Label>
                    <Input
                      id="contact_email"
                      value={generalForm.contact_email}
                      onChange={(e) => setGeneralForm((f) => ({ ...f, contact_email: e.target.value }))}
                      placeholder="info@minegocio.com"
                      disabled={!isOwner}
                    />
                  </div>
                )}
                {generalForm.contact_action === "custom_message" && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_msg">Mensaje personalizado</Label>
                    <Textarea
                      id="contact_msg"
                      value={generalForm.contact_custom_message}
                      onChange={(e) => setGeneralForm((f) => ({ ...f, contact_custom_message: e.target.value }))}
                      placeholder="Para agendar una cita, llama al 600 123 4567 o visítanos en..."
                      disabled={!isOwner}
                      rows={3}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Bot config */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Configuración del Bot
                </h4>
                <div className="space-y-2">
                  <Label htmlFor="bot_name">Nombre del bot</Label>
                  <Input
                    id="bot_name"
                    value={generalForm.bot_name}
                    onChange={(e) =>
                      setGeneralForm((f) => ({ ...f, bot_name: e.target.value }))
                    }
                    placeholder="Ej: Sofía, Vendedor, Asistente..."
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot_welcome">Mensaje de bienvenida</Label>
                  <Textarea
                    id="bot_welcome"
                    value={generalForm.bot_welcome_message}
                    onChange={(e) =>
                      setGeneralForm((f) => ({
                        ...f,
                        bot_welcome_message: e.target.value,
                      }))
                    }
                    placeholder="¡Hola! ¿En qué puedo ayudarte hoy?"
                    disabled={!isOwner}
                    rows={3}
                  />
                </div>

                {/* Tono del bot */}
                <div className="space-y-2">
                  <Label>Tono de comunicación</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { id: "formal" as const, label: "Formal", example: "\"Estimado/a, ¿en qué puedo asistirle?\"" },
                      { id: "amigable" as const, label: "Amigable", example: "\"¡Hola! ¿En qué te puedo ayudar? 😊\"" },
                      { id: "informal" as const, label: "Informal", example: "\"¡Hey! ¿Qué onda, en qué te ayudo? 🙌\"" },
                    ]).map((tone) => (
                      <button
                        key={tone.id}
                        type="button"
                        disabled={!isOwner}
                        className={`p-3 rounded-lg border text-left transition-colors ${generalForm.bot_tone === tone.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                          }`}
                        onClick={() => setGeneralForm((f) => ({ ...f, bot_tone: tone.id }))}
                      >
                        <p className="text-sm font-medium">{tone.label}</p>
                        <p className="text-xs text-muted-foreground mt-1 italic">{tone.example}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {isOwner && (
                <Button onClick={saveGeneral} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Guardar cambios
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Widget Web */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4" />
                Widget Web
              </CardTitle>
              <CardDescription>
                Agrega el chat bot a cualquier sitio web con este código
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tenant?.id ? (
                <>
                  <div className="relative">
                    <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                      {`<script src="${getAppUrl()}/widget.js"
  data-tenant-id="${tenant.id}"
  data-bot-name="${generalForm.bot_name}"
  data-welcome="${generalForm.bot_welcome_message}">
</script>`}
                    </pre>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const snippet = `<script src="${getAppUrl()}/widget.js" data-tenant-id="${tenant.id}" data-bot-name="${generalForm.bot_name}" data-welcome="${generalForm.bot_welcome_message}"></script>`;
                      navigator.clipboard.writeText(snippet);
                      toast.success("Código copiado al portapapeles");
                    }}
                  >
                    Copiar código
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Cargando...</p>
              )}
            </CardContent>
          </Card>

          {/* Plan actual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="w-4 h-4" />
                Plan actual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={plan === "enterprise" ? "success" : plan === "pro" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {plan}
                    </Badge>
                    <Badge
                      variant={
                        tenant?.saas_subscription_status === "active"
                          ? "success"
                          : "warning"
                      }
                    >
                      {tenant?.saas_subscription_status === "active"
                        ? "Activo"
                        : tenant?.saas_subscription_status === "trial"
                          ? "Prueba"
                          : "Inactivo"}
                    </Badge>
                  </div>
                  {tenant?.trial_ends_at &&
                    tenant?.saas_subscription_status === "trial" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Prueba hasta:{" "}
                        {new Date(tenant.trial_ends_at).toLocaleDateString("es-CL")}
                      </p>
                    )}
                </div>
                {plan !== "enterprise" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/pricing")}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Upgrade
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: INTEGRACIONES === */}
        <TabsContent value="integrations" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4" />
                Marketplace de Integraciones
              </CardTitle>
              <CardDescription>
                Elige una integración y conecta en pocos pasos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Meta (OAuth)</p>
                  <p className="text-xs text-muted-foreground">WhatsApp, Messenger, Instagram</p>
                </div>
                <Badge variant="outline">OAuth</Badge>
                <Button className="w-full" variant="outline" onClick={() => router.push("/dashboard/channels")}>
                  Conectar
                </Button>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Mercado Pago (OAuth)</p>
                  <p className="text-xs text-muted-foreground">
                    Estado: {isMPConnected ? "Conectado" : "No conectado"}
                  </p>
                </div>
                <Badge variant={isMPConnected ? "success" : "outline"}>
                  {isMPConnected ? "Conectado" : "Pendiente"}
                </Badge>
                <Button className="w-full" onClick={handleConnectMP} disabled={!isOwner || isPending}>
                  {isMPConnected ? "Reconectar" : "Conectar"}
                </Button>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Gmail (OAuth)</p>
                  <p className="text-xs text-muted-foreground">
                    {gmailOAuthForm.email
                      ? `Cuenta: ${gmailOAuthForm.email}`
                      : "Conecta Gmail sin configurar puerto ni SMTP"}
                  </p>
                </div>
                <Badge variant={gmailOAuthForm.is_active ? "success" : "outline"}>
                  {gmailOAuthForm.is_active ? "Conectado" : "No conectado"}
                </Badge>
                <Button className="w-full" onClick={handleConnectGmail} disabled={!isOwner || isPending}>
                  {gmailOAuthForm.is_active ? "Reconectar" : "Conectar"}
                </Button>
                {gmailOAuthForm.is_active && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setSelectedConnector("gmail_oauth")}
                  >
                    Administrar
                  </Button>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Email SMTP</p>
                  <p className="text-xs text-muted-foreground">Gmail, Outlook o servidor propio</p>
                </div>
                <Badge variant={smtpForm.is_active ? "success" : "outline"}>
                  {smtpForm.is_active ? "Activo" : "No configurado"}
                </Badge>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setSelectedConnector("smtp")}
                >
                  {smtpForm.is_active ? "Editar" : "Configurar"}
                </Button>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Resend</p>
                  <p className="text-xs text-muted-foreground">Proveedor transaccional de email</p>
                </div>
                <Badge variant={resendForm.is_active ? "success" : "outline"}>
                  {resendForm.is_active ? "Activo" : "No configurado"}
                </Badge>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setSelectedConnector("resend")}
                >
                  {resendForm.is_active ? "Editar" : "Configurar"}
                </Button>
              </div>

              <div className="rounded-md border p-3 space-y-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">n8n Webhook</p>
                  <p className="text-xs text-muted-foreground">Automatizaciones externas por tenant</p>
                </div>
                <Badge variant={n8nForm.is_active ? "success" : "outline"}>
                  {n8nForm.is_active ? "Activo" : "No configurado"}
                </Badge>
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  onClick={() => setSelectedConnector("n8n")}
                >
                  {n8nForm.is_active ? "Editar" : "Configurar"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="w-4 h-4" />
                Configuración del Conector
              </CardTitle>
              <CardDescription>
                Selecciona un conector en el marketplace y guarda los datos para este tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isIntegrationsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando integraciones del tenant...
                </div>
              ) : (
                <>
                  {(selectedConnector === "gmail_oauth" || (!selectedConnector && gmailOAuthForm.is_active)) && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Gmail (OAuth)</p>
                        <Badge variant={gmailOAuthForm.is_active ? "success" : "outline"}>
                          {gmailOAuthForm.is_active ? "Conectado" : "No conectado"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {gmailOAuthForm.email
                          ? `Conectado como ${gmailOAuthForm.email}`
                          : "Sin cuenta conectada"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleConnectGmail} disabled={!isOwner || isPending}>
                          {gmailOAuthForm.is_active ? "Reconectar Gmail" : "Conectar Gmail"}
                        </Button>
                        {gmailOAuthForm.is_active && (
                          <Button
                            variant="outline"
                            onClick={handleDisconnectGmail}
                            disabled={!isOwner || isPending}
                          >
                            Desconectar
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Recomendado para dueÃ±os: conexiÃ³n simple OAuth, sin host/puerto manual.
                      </p>
                    </div>
                  )}

                  {(selectedConnector === "smtp" || (!selectedConnector && smtpForm.is_active)) && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">SMTP</p>
                        <label className="text-xs flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={smtpForm.is_active}
                            onChange={(e) =>
                              setSmtpForm((prev) => ({ ...prev, is_active: e.target.checked }))
                            }
                            disabled={!isOwner}
                          />
                          Activo
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="smtp_host">Host</Label>
                          <Input
                            id="smtp_host"
                            value={smtpForm.host}
                            onChange={(e) =>
                              setSmtpForm((prev) => ({ ...prev, host: e.target.value }))
                            }
                            placeholder="smtp.gmail.com"
                            disabled={!isOwner}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="smtp_port">Puerto</Label>
                          <Input
                            id="smtp_port"
                            type="number"
                            value={String(smtpForm.port)}
                            onChange={(e) =>
                              setSmtpForm((prev) => ({
                                ...prev,
                                port: Number(e.target.value || 587),
                              }))
                            }
                            placeholder="587"
                            disabled={!isOwner}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="smtp_user">Usuario SMTP</Label>
                          <Input
                            id="smtp_user"
                            value={smtpForm.user}
                            onChange={(e) =>
                              setSmtpForm((prev) => ({ ...prev, user: e.target.value }))
                            }
                            placeholder="usuario@dominio.com"
                            disabled={!isOwner}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="smtp_from">From Email</Label>
                          <Input
                            id="smtp_from"
                            value={smtpForm.from_email}
                            onChange={(e) =>
                              setSmtpForm((prev) => ({ ...prev, from_email: e.target.value }))
                            }
                            placeholder="noreply@dominio.com"
                            disabled={!isOwner}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_password">Password / App Password</Label>
                        <Input
                          id="smtp_password"
                          type="password"
                          value={smtpForm.password}
                          onChange={(e) =>
                            setSmtpForm((prev) => ({ ...prev, password: e.target.value }))
                          }
                          placeholder={smtpForm.has_password ? "******** (configurada)" : "Ingresa password"}
                          disabled={!isOwner}
                        />
                      </div>
                      <label className="text-xs flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={smtpForm.secure}
                          onChange={(e) =>
                            setSmtpForm((prev) => ({ ...prev, secure: e.target.checked }))
                          }
                          disabled={!isOwner}
                        />
                        Usar TLS/SSL (`secure=true`, típico puerto 465)
                      </label>
                      {isOwner && (
                        <Button onClick={saveSmtpSettings} disabled={isPending}>
                          Guardar SMTP
                        </Button>
                      )}
                    </div>
                  )}

                  {(selectedConnector === "resend" || (!selectedConnector && resendForm.is_active)) && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Resend (Email)</p>
                        <label className="text-xs flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={resendForm.is_active}
                            onChange={(e) =>
                              setResendForm((prev) => ({ ...prev, is_active: e.target.checked }))
                            }
                            disabled={!isOwner}
                          />
                          Activo
                        </label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="resend_from">Email remitente</Label>
                        <Input
                          id="resend_from"
                          value={resendForm.from_email}
                          onChange={(e) =>
                            setResendForm((prev) => ({ ...prev, from_email: e.target.value }))
                          }
                          placeholder="noreply@tu-dominio.com"
                          disabled={!isOwner}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="resend_api_key">API Key</Label>
                        <Input
                          id="resend_api_key"
                          type="password"
                          value={resendForm.api_key}
                          onChange={(e) =>
                            setResendForm((prev) => ({ ...prev, api_key: e.target.value }))
                          }
                          placeholder={resendForm.has_api_key ? "******** (configurada)" : "re_xxx..."}
                          disabled={!isOwner}
                        />
                        <p className="text-xs text-muted-foreground">
                          Se almacena cifrada. Deja vacio para mantener la clave actual.
                        </p>
                      </div>
                      {isOwner && (
                        <Button onClick={saveResendSettings} disabled={isPending}>
                          Guardar Resend
                        </Button>
                      )}
                    </div>
                  )}

                  {(selectedConnector === "n8n" || (!selectedConnector && n8nForm.is_active)) && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">n8n Webhook</p>
                        <label className="text-xs flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={n8nForm.is_active}
                            onChange={(e) =>
                              setN8nForm((prev) => ({ ...prev, is_active: e.target.checked }))
                            }
                            disabled={!isOwner}
                          />
                          Activo
                        </label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="n8n_webhook">Webhook URL</Label>
                        <Input
                          id="n8n_webhook"
                          value={n8nForm.webhook_url}
                          onChange={(e) =>
                            setN8nForm((prev) => ({ ...prev, webhook_url: e.target.value }))
                          }
                          placeholder="https://tu-n8n.com/webhook/yd-social-ops"
                          disabled={!isOwner}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="n8n_auth_header">Authorization Header (opcional)</Label>
                        <Input
                          id="n8n_auth_header"
                          type="password"
                          value={n8nForm.auth_header}
                          onChange={(e) =>
                            setN8nForm((prev) => ({ ...prev, auth_header: e.target.value }))
                          }
                          placeholder={n8nForm.has_auth_header ? "******** (configurado)" : "Bearer xxx"}
                          disabled={!isOwner}
                        />
                      </div>
                      {isOwner && (
                        <Button onClick={saveN8nSettings} disabled={isPending}>
                          Guardar n8n
                        </Button>
                      )}
                    </div>
                  )}

                  {!selectedConnector &&
                    !gmailOAuthForm.is_active &&
                    !smtpForm.is_active &&
                    !resendForm.is_active &&
                    !n8nForm.is_active && (
                      <p className="text-sm text-muted-foreground">
                        Selecciona una integración arriba para comenzar.
                      </p>
                    )}

                  <p className="text-xs text-muted-foreground">
                    `.env.local` queda solo para secretos globales de la plataforma (ej: `CRON_SECRET`).
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: PAGOS === */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {/* Plan Básico: Datos bancarios */}
          {(plan === "basic" || plan === "pro" || plan === "enterprise") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="w-4 h-4" />
                  Datos de transferencia bancaria
                  <Badge variant="secondary" className="ml-auto">
                    {plan === "basic" ? "Plan Básico" : "Fallback"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {plan === "basic"
                    ? "El bot entregará estos datos cuando un cliente quiera pagar (opción «Datos de transferencia» en General)."
                    : "Si Mercado Pago no está conectado, el bot usará estos datos. Configúralos para que el bot siempre pueda compartir cómo pagar por transferencia."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bank_details">
                    Datos bancarios (banco, cuenta, RUT, nombre)
                  </Label>
                  <Textarea
                    id="bank_details"
                    value={bankDetails}
                    onChange={(e) => setBankDetails(e.target.value)}
                    placeholder={`Banco: BancoEstado\nTipo: Cuenta RUT\nNúmero: 12345678\nRUT: 12.345.678-9\nNombre: Juan Pérez`}
                    rows={5}
                    disabled={!isOwner}
                    className="font-mono text-sm"
                  />
                </div>
                {isOwner && (
                  <Button
                    onClick={saveBankDetails}
                    disabled={isPending}
                    variant={plan === "basic" ? "default" : "outline"}
                  >
                    {isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Guardar datos bancarios
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Plan Pro/Enterprise: Mercado Pago */}
          {plan === "basic" ? (
            <Card className="border-dashed opacity-75">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                  <Zap className="w-4 h-4" />
                  Mercado Pago automático
                  <Badge variant="secondary" className="ml-auto">Solo Plan Pro</Badge>
                </CardTitle>
                <CardDescription>
                  Actualiza al Plan Pro para generar links de pago automáticos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => router.push("/pricing")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver Plan Pro
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card
              className={
                isMPConnected
                  ? "border-green-500/30 bg-green-500/5"
                  : ""
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="w-4 h-4 text-blue-500" />
                  Mercado Pago
                  {isMPConnected ? (
                    <Badge variant="success" className="ml-auto">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Conectado
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="ml-auto">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      No conectado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {isMPConnected
                    ? `Cuenta MP ID: ${tenant?.mp_user_id} • Conectado el ${tenant?.mp_connected_at ? new Date(tenant.mp_connected_at).toLocaleDateString("es-CL") : "—"}`
                    : "Conecta tu cuenta de Mercado Pago para generar links de pago automáticos"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {!isMPConnected ? (
                  <Button onClick={handleConnectMP} disabled={!isOwner || isPending}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Conectar cuenta Mercado Pago
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleConnectMP}
                      disabled={!isOwner || isPending}
                    >
                      Reconectar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDisconnectMP}
                      disabled={!isOwner || isPending}
                    >
                      {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : null}
                      Desconectar
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === TAB: ENTERPRISE === */}
        {plan === "enterprise" && (
          <TabsContent value="enterprise" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  Configuración White-Label
                </CardTitle>
                <CardDescription>
                  Personaliza el bot con tu marca
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wl_name">Nombre de la marca</Label>
                  <Input
                    id="wl_name"
                    value={enterpriseForm.white_label_name}
                    onChange={(e) =>
                      setEnterpriseForm((f) => ({
                        ...f,
                        white_label_name: e.target.value,
                      }))
                    }
                    placeholder="Mi Empresa S.A."
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wl_domain">
                    <Globe className="w-3.5 h-3.5 inline mr-1" />
                    Dominio personalizado
                  </Label>
                  <Input
                    id="wl_domain"
                    value={enterpriseForm.white_label_domain}
                    onChange={(e) =>
                      setEnterpriseForm((f) => ({
                        ...f,
                        white_label_domain: e.target.value,
                      }))
                    }
                    placeholder="bot.miempresa.com"
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wl_logo">URL del logo</Label>
                  <Input
                    id="wl_logo"
                    value={enterpriseForm.white_label_logo}
                    onChange={(e) =>
                      setEnterpriseForm((f) => ({
                        ...f,
                        white_label_logo: e.target.value,
                      }))
                    }
                    placeholder="https://miempresa.com/logo.png"
                    disabled={!isOwner}
                  />
                </div>
                {isOwner && (
                  <Button onClick={saveEnterprise} disabled={isPending}>
                    {isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Guardar configuración Enterprise
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="w-4 h-4" />
                  Integraciones Avanzadas (MCP)
                </CardTitle>
                <CardDescription>
                  Solo para equipos tecnicos. Si buscas simplicidad, usa primero Integraciones OAuth.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="mcp_name">Nombre</Label>
                    <Input
                      id="mcp_name"
                      value={mcpForm.name}
                      onChange={(e) =>
                        setMcpForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="Google Sheets MCP"
                      disabled={!isOwner}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mcp_url">URL</Label>
                    <Input
                      id="mcp_url"
                      value={mcpForm.url}
                      onChange={(e) =>
                        setMcpForm((prev) => ({ ...prev, url: e.target.value }))
                      }
                      placeholder="https://mcp.tu-dominio.com"
                      disabled={!isOwner}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="mcp_auth_type">Autenticacion</Label>
                    <select
                      id="mcp_auth_type"
                      value={mcpForm.auth_type}
                      onChange={(e) =>
                        setMcpForm((prev) => ({
                          ...prev,
                          auth_type: e.target.value as McpAuthType,
                        }))
                      }
                      disabled={!isOwner}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="none">Sin auth</option>
                      <option value="bearer">Bearer token</option>
                      <option value="api_key">API Key</option>
                    </select>
                  </div>

                  {mcpForm.auth_type !== "none" && (
                    <div className="space-y-2">
                      <Label htmlFor="mcp_auth_secret">Secreto</Label>
                      <Input
                        id="mcp_auth_secret"
                        type="password"
                        value={mcpForm.auth_secret}
                        onChange={(e) =>
                          setMcpForm((prev) => ({ ...prev, auth_secret: e.target.value }))
                        }
                        placeholder="Ingresa el secreto"
                        disabled={!isOwner}
                      />
                    </div>
                  )}
                </div>

                {isOwner && (
                  <Button onClick={createEnterpriseMcpServer} disabled={isPending}>
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Agregar servidor MCP
                  </Button>
                )}

                <Separator />

                <div className="space-y-2">
                  {isMcpLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando servidores MCP...
                    </div>
                  ) : mcpServers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay servidores MCP configurados para este tenant.
                    </p>
                  ) : (
                    mcpServers.map((server) => (
                      <div
                        key={server.id}
                        className="rounded-md border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium">{server.name}</p>
                          <p className="text-xs text-muted-foreground break-all">
                            {server.url}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">{server.auth_type}</Badge>
                            <Badge variant={server.is_active ? "success" : "secondary"}>
                              {server.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                          </div>
                        </div>
                        {isOwner && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleMcpServerStatus(server)}
                              disabled={isPending}
                            >
                              {server.is_active ? "Desactivar" : "Activar"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeMcpServer(server)}
                              disabled={isPending}
                            >
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Límites del plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">
                    Usuarios máximos
                  </span>
                  <Badge variant="secondary">{tenant?.max_users || 1}</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">
                    Canales sociales
                  </span>
                  <Badge variant="secondary">Ilimitados</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
