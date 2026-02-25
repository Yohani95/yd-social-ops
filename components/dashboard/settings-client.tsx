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
import { updateBankDetails, updateTenant, disconnectMP } from "@/actions/tenant";
import type { Tenant, BusinessType, ContactAction, BotTone } from "@/types";

interface SettingsClientProps {
  tenant: Tenant | null;
  userRole: string;
  mpSuccess?: boolean;
  mpError?: string;
}

const mpErrorMessages: Record<string, string> = {
  missing_params: "Parámetros incompletos en la respuesta de Mercado Pago",
  invalid_state: "Estado de autorización inválido",
  token_exchange_failed: "No se pudo obtener el token de acceso",
  db_error: "Error al guardar los tokens en la base de datos",
};

export function SettingsClient({
  tenant,
  userRole,
  mpSuccess,
  mpError,
}: SettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estado del formulario general
  const [generalForm, setGeneralForm] = useState({
    name: tenant?.name || "",
    business_name: tenant?.business_name || "",
    business_type: (tenant?.business_type || "products") as BusinessType,
    business_description: tenant?.business_description || "",
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
  }, [mpSuccess, mpError, router]);

  const isOwner = userRole === "owner";
  const plan = tenant?.plan_tier || "basic";
  const isMPConnected = !!tenant?.mp_user_id;

  function handleConnectMP() {
    if (!tenant?.id) return;
    // El tenant_id se pasa como state en base64url
    const state = Buffer.from(JSON.stringify({ tenant_id: tenant.id })).toString("base64url");
    const clientId = process.env.NEXT_PUBLIC_MP_CLIENT_ID || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
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
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-3 lg:w-auto lg:grid-cols-none lg:inline-flex">
          <TabsTrigger value="general">General</TabsTrigger>
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
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        generalForm.business_type === bt.id
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
              </div>

              <Separator />

              {/* Acción de contacto */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Cuando un cliente quiere comprar/reservar/contratar</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    { id: "payment_link" as const, label: "Link de pago", desc: "Genera link de Mercado Pago", icon: CreditCard },
                    { id: "whatsapp_contact" as const, label: "Contacto WhatsApp", desc: "Envía al WhatsApp del dueño", icon: Phone },
                    { id: "email_contact" as const, label: "Contacto Email", desc: "Envía al email del negocio", icon: Mail },
                    { id: "custom_message" as const, label: "Mensaje personalizado", desc: "Muestra un mensaje custom", icon: FileText },
                  ]).map((ca) => (
                    <button
                      key={ca.id}
                      type="button"
                      disabled={!isOwner}
                      className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-3 ${
                        generalForm.contact_action === ca.id
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
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          generalForm.bot_tone === tone.id
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
{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js"
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
                      const snippet = `<script src="${window.location.origin}/widget.js" data-tenant-id="${tenant.id}" data-bot-name="${generalForm.bot_name}" data-welcome="${generalForm.bot_welcome_message}"></script>`;
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

        {/* === TAB: PAGOS === */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {/* Plan Básico: Datos bancarios */}
          {(plan === "basic" || plan === "pro" || plan === "enterprise") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="w-4 h-4" />
                  Datos de transferencia bancaria
                  <Badge variant="secondary" className="ml-auto">Plan Básico</Badge>
                </CardTitle>
                <CardDescription>
                  El bot entregará estos datos cuando un cliente quiera pagar por transferencia
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
