"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
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
import { toast } from "sonner";
import { updateBankDetails, updateTenant, disconnectMP } from "@/actions/tenant";
import { normalizeBaseUrl } from "@/lib/app-url";
import type {
  Tenant,
  MerchantPaymentLink,
  PlanTier,
} from "@/types";

type MerchantCheckoutMode = "bank_transfer" | "external_link" | "mp_oauth";
type MerchantAdHocLinkMode = "manual" | "approval" | "automatic";

interface SaasSubscription {
  id: string;
  mp_preapproval_id?: string;
  plan_tier: PlanTier;
  status: string;
  next_billing_date?: string | null;
}

interface SaasBillingEvent {
  id: string;
  event_topic: string;
  event_resource_id: string;
  processed: boolean;
  processed_at?: string | null;
  created_at: string;
}

interface BillingSubscriptionResponse {
  data?: {
    tenant?: Tenant | null;
    subscription?: SaasSubscription | null;
    recent_events?: SaasBillingEvent[];
    last_sync_at?: string | null;
    last_sync_source?: "webhook" | "reconcile" | null;
  };
}

interface MerchantLinksResponse {
  data?: MerchantPaymentLink[];
}

const planOrder: PlanTier[] = ["basic", "pro", "business", "enterprise", "enterprise_plus"];

const saasPlanOptions: Array<{
  id: PlanTier;
  name: string;
  priceLabel: string;
  description: string;
  badge?: string;
}> = [
  { id: "basic", name: "Basic", priceLabel: "$9.990/mes", description: "Inicio para ventas asistidas por IA." },
  { id: "pro", name: "Pro", priceLabel: "$24.990/mes", description: "Automatiza pagos y escala conversión.", badge: "Popular" },
  { id: "business", name: "Business", priceLabel: "$49.990/mes", description: "Canales sociales + operación comercial." },
  { id: "enterprise", name: "Enterprise", priceLabel: "$79.990/mes", description: "Equipo multiusuario y white-label." },
  { id: "enterprise_plus", name: "Enterprise+", priceLabel: "$199.990/mes", description: "Soporte y features premium." },
];

function getPlanRank(planTier: PlanTier): number {
  return planOrder.indexOf(planTier);
}

function getPlanLabel(planTier: PlanTier): string {
  return saasPlanOptions.find((item) => item.id === planTier)?.name || planTier;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "sin fecha";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toLocaleString("es-CL");
}

function formatMoneyCLP(value?: number | null): string {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString("es-CL")}`;
}

function encodeBase64Url(value: string): string {
  if (typeof window === "undefined") return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

interface PaymentsClientProps {
  tenant: Tenant | null;
  userRole: string;
  mpSubReturn?: boolean;
  mpPreapprovalId?: string;
  initialSaasPlan?: PlanTier;
}

export function PaymentsClient({
  tenant,
  userRole,
  mpSubReturn,
  mpPreapprovalId,
  initialSaasPlan,
}: PaymentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isOwner = userRole === "owner";

  // Bank details
  const [bankDetails, setBankDetails] = useState(tenant?.bank_details || "");

  // Merchant checkout form
  const [merchantForm, setMerchantForm] = useState({
    merchant_checkout_mode: (tenant?.merchant_checkout_mode || "bank_transfer") as MerchantCheckoutMode,
    merchant_external_checkout_url: tenant?.merchant_external_checkout_url || "",
    merchant_ad_hoc_link_mode: (tenant?.merchant_ad_hoc_link_mode || "manual") as MerchantAdHocLinkMode,
    merchant_ad_hoc_max_amount_clp: tenant?.merchant_ad_hoc_max_amount_clp || 100000,
    merchant_ad_hoc_expiry_minutes: tenant?.merchant_ad_hoc_expiry_minutes || 60,
  });

  // SaaS subscription
  const [saasPlanToSubscribe, setSaasPlanToSubscribe] = useState<PlanTier>(
    initialSaasPlan || (tenant?.plan_tier as PlanTier) || "basic"
  );
  const [saasSubscription, setSaasSubscription] = useState<SaasSubscription | null>(null);
  const [saasRecentEvents, setSaasRecentEvents] = useState<SaasBillingEvent[]>([]);
  const [isSaasSyncing, setIsSaasSyncing] = useState(false);
  const [saasLastSyncAt, setSaasLastSyncAt] = useState<string | null>(null);
  const [saasLastSyncSource, setSaasLastSyncSource] = useState<"webhook" | "reconcile" | null>(null);
  const [billingTenant, setBillingTenant] = useState<Tenant | null>(tenant || null);

  // Merchant links
  const [merchantLinks, setMerchantLinks] = useState<MerchantPaymentLink[]>([]);
  const [isMerchantLinksLoading, setIsMerchantLinksLoading] = useState(false);

  const didAutoReconcileRef = useRef(false);

  // Derived state
  const tenantView = billingTenant || tenant;
  const plan = (tenantView?.plan_tier || "basic") as PlanTier;
  const currentSubscriptionStatus = tenantView?.saas_subscription_status || "inactive";
  const isMPConnected = !!tenantView?.mp_user_id;
  const planAllowsMPOAuth = plan !== "basic";
  const currentPlanRank = getPlanRank(plan);
  const selectedPlanRank = getPlanRank(saasPlanToSubscribe);
  const selectedIsUpgrade = selectedPlanRank > currentPlanRank;
  const selectedIsDowngrade = selectedPlanRank < currentPlanRank;
  const selectedIsSamePlan = selectedPlanRank === currentPlanRank;
  const activeOrTrial = currentSubscriptionStatus === "active" || currentSubscriptionStatus === "trial";
  const pendingPlanTier = tenantView?.pending_plan_tier || null;
  const pendingPlanEffectiveAt = tenantView?.pending_plan_effective_at || null;
  const pendingPlanDue = (() => {
    if (!pendingPlanTier || pendingPlanTier !== saasPlanToSubscribe || !pendingPlanEffectiveAt) return false;
    const ms = Date.parse(pendingPlanEffectiveAt);
    return !Number.isNaN(ms) && ms <= Date.now();
  })();
  const subscribeButtonDisabled = !isOwner || isPending || (selectedIsSamePlan && activeOrTrial);
  const subscribeButtonLabel = (() => {
    if (selectedIsSamePlan && activeOrTrial) return "Ya estás en este plan";
    if (selectedIsDowngrade && !pendingPlanDue) return "Programar para próximo ciclo";
    if (pendingPlanDue) return "Confirmar cambio programado";
    if (selectedIsUpgrade) return "Cambiar ahora";
    return "Suscribirse";
  })();

  // Data loading
  async function loadSaasSubscription() {
    if (!tenant?.id) return;
    try {
      const res = await fetch("/api/billing/subscription", { method: "GET" });
      const data = (await res.json()) as BillingSubscriptionResponse;
      setSaasSubscription(data?.data?.subscription || null);
      setBillingTenant((data?.data?.tenant as Tenant | null) || tenant);
      setSaasRecentEvents(Array.isArray(data?.data?.recent_events) ? data.data.recent_events : []);
      setSaasLastSyncAt(data?.data?.last_sync_at || null);
      setSaasLastSyncSource(data?.data?.last_sync_source || null);
    } catch {
      setSaasSubscription(null);
      setBillingTenant(tenant || null);
      setSaasRecentEvents([]);
      setSaasLastSyncAt(null);
      setSaasLastSyncSource(null);
    }
  }

  async function loadMerchantLinks() {
    if (!tenant?.id) return;
    if (!isOwner && userRole !== "admin") return;
    setIsMerchantLinksLoading(true);
    try {
      const res = await fetch("/api/merchant/payment-links?limit=20", { method: "GET" });
      const data = (await res.json()) as MerchantLinksResponse;
      if (!res.ok) { setMerchantLinks([]); return; }
      setMerchantLinks(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setMerchantLinks([]);
    } finally {
      setIsMerchantLinksLoading(false);
    }
  }

  async function reconcileSaasSubscription(showToast = true) {
    if (!isOwner || !tenant?.id) return;
    setIsSaasSyncing(true);
    try {
      const res = await fetch("/api/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_tier: saasPlanToSubscribe,
          preapproval_id: mpPreapprovalId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (showToast) toast.error(data?.error || "No se pudo sincronizar suscripción.");
        return;
      }
      await loadSaasSubscription();
      router.refresh();
      if (showToast) toast.success("Suscripción sincronizada.");
    } catch {
      if (showToast) toast.error("No se pudo sincronizar suscripción.");
    } finally {
      setIsSaasSyncing(false);
    }
  }

  // Effects
  useEffect(() => { void loadSaasSubscription(); }, [tenant?.id]);
  useEffect(() => { void loadMerchantLinks(); }, [tenant?.id, userRole]);

  useEffect(() => {
    if (!mpSubReturn || !isOwner || !tenant?.id) return;
    if (didAutoReconcileRef.current) return;
    didAutoReconcileRef.current = true;
    toast.message("Verificando estado de tu suscripción...");
    void (async () => {
      await reconcileSaasSubscription(false);
      router.replace("/dashboard/payments");
    })();
  }, [mpSubReturn, mpPreapprovalId, isOwner, tenant?.id]);

  // Handlers
  function saveBankDetails() {
    startTransition(async () => {
      const result = await updateBankDetails(bankDetails);
      if (result.success) toast.success("Datos bancarios guardados");
      else toast.error(result.error || "Error al guardar");
    });
  }

  function saveMerchantCheckoutSettings() {
    if (!isOwner) return;
    const mode = merchantForm.merchant_checkout_mode;
    const externalUrl = merchantForm.merchant_external_checkout_url.trim();
    const adHocMode = merchantForm.merchant_ad_hoc_link_mode;
    const adHocMaxAmount = Number(merchantForm.merchant_ad_hoc_max_amount_clp);
    const adHocExpiry = Number(merchantForm.merchant_ad_hoc_expiry_minutes);

    if (mode === "mp_oauth" && !planAllowsMPOAuth) {
      toast.error("El plan Básico no permite OAuth de Mercado Pago.");
      return;
    }
    if (mode === "external_link") {
      if (!externalUrl) { toast.error("Debes configurar un link externo para este modo."); return; }
      try { new URL(externalUrl); } catch { toast.error("El link externo no es una URL válida."); return; }
    }
    if (!["manual", "approval", "automatic"].includes(adHocMode)) { toast.error("Modo ad-hoc inválido."); return; }
    if (adHocMode === "automatic" && mode === "bank_transfer") { toast.error("El modo ad-hoc automático requiere OAuth o link externo."); return; }
    if (!Number.isFinite(adHocMaxAmount) || adHocMaxAmount <= 0) { toast.error("El monto máximo ad-hoc debe ser mayor a 0."); return; }
    if (!Number.isFinite(adHocExpiry) || adHocExpiry < 5 || adHocExpiry > 10080) { toast.error("La expiración ad-hoc debe estar entre 5 y 10080 minutos."); return; }

    startTransition(async () => {
      const result = await updateTenant({
        merchant_checkout_mode: mode,
        merchant_external_checkout_url: mode === "external_link" ? externalUrl : null,
        merchant_ad_hoc_link_mode: adHocMode,
        merchant_ad_hoc_max_amount_clp: adHocMaxAmount,
        merchant_ad_hoc_expiry_minutes: adHocExpiry,
      });
      if (!result.success) { toast.error(result.error || "No se pudo guardar el método de cobro."); return; }
      toast.success("Método de cobro guardado.");
      await loadSaasSubscription();
    });
  }

  function startSaasSubscription() {
    if (!isOwner) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_tier: saasPlanToSubscribe }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errorCode = typeof data?.error_code === "string" ? data.error_code : null;
          const phase = typeof data?.phase === "string" ? data.phase : null;
          if (res.status === 409 && data?.error_code === "already_on_plan") {
            toast.message("Ya estás en este plan.");
            return;
          }
          if (errorCode === "db_query_failed") {
            toast.error("Base de datos desactualizada, falta migración de billing.");
            if (phase) toast.message(`Fase: ${phase}`);
            const dbMessage = typeof data?.details?.message === "string" ? data.details.message : "";
            if (dbMessage) toast.message(`Detalle DB: ${dbMessage}`);
            return;
          }
          const details = typeof data?.details === "string" ? data.details
            : typeof data?.details?.effective_at === "string" ? `Efectivo desde ${formatDateTime(data.details.effective_at)}` : "";
          toast.error(data?.error || "No se pudo iniciar la suscripción.");
          if (errorCode || phase) toast.message([errorCode ? `Código: ${errorCode}` : "", phase ? `Fase: ${phase}` : ""].filter(Boolean).join(" | "));
          if (details) toast.message(details);
          return;
        }
        if (data?.data?.mode === "scheduled_downgrade") {
          const effectiveAt = typeof data?.data?.effective_at === "string" ? data.data.effective_at : null;
          toast.success(effectiveAt ? `Cambio programado para ${formatDateTime(effectiveAt)}.` : "Cambio de plan programado para el próximo ciclo.");
          await loadSaasSubscription();
          router.refresh();
          return;
        }
        if (!data?.data?.checkout_url) { toast.error("No se pudo iniciar la suscripción."); return; }
        if (data?.data?.mode === "plan_checkout") toast.message("Redirigiendo al checkout de suscripción de Mercado Pago...");
        window.location.href = data.data.checkout_url as string;
      } catch (error) {
        console.error(error);
        toast.error("No se pudo iniciar la suscripción.");
      }
    });
  }

  function handleConnectMP() {
    if (!tenant?.id) return;
    if (!planAllowsMPOAuth) { toast.error("El plan Básico no permite conectar OAuth de Mercado Pago."); return; }
    const clientId = process.env.NEXT_PUBLIC_MP_CLIENT_ID || "";
    if (!clientId) { toast.error("Falta NEXT_PUBLIC_MP_CLIENT_ID en el entorno."); return; }
    const nonce = generateNonce();
    setOAuthNonceCookie("yd_oauth_nonce_mp", nonce);
    const state = encodeBase64Url(JSON.stringify({ tenant_id: tenant.id, nonce, ts: Date.now() }));
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

  function handleDisconnectMP() {
    startTransition(async () => {
      const result = await disconnectMP();
      if (result.success) toast.success("Mercado Pago desconectado");
      else toast.error(result.error || "Error al desconectar");
    });
  }

  function approveMerchantLink(linkId: string) {
    if (!isOwner && userRole !== "admin") return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/merchant/payment-links/${linkId}/approve`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) { toast.error(data?.error || "No se pudo aprobar el link."); return; }
        toast.success("Link aprobado.");
        await loadMerchantLinks();
      } catch { toast.error("No se pudo aprobar el link."); }
    });
  }

  function rejectMerchantLink(linkId: string) {
    if (!isOwner && userRole !== "admin") return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/merchant/payment-links/${linkId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Rechazado desde panel de pagos" }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data?.error || "No se pudo rechazar el link."); return; }
        toast.success("Link rechazado.");
        await loadMerchantLinks();
      } catch { toast.error("No se pudo rechazar el link."); }
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona tu suscripción, métodos de cobro y links de pago.
        </p>
      </div>

      {/* Suscripción SaaS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" />
            Suscripción de mi cuenta (SaaS)
          </CardTitle>
          <CardDescription>
            Este cobro es para tu plan en YD Social Ops y se procesa con preapproval recurrente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Plan actual: {getPlanLabel(plan)}</Badge>
            <Badge variant={currentSubscriptionStatus === "active" ? "success" : currentSubscriptionStatus === "trial" ? "warning" : "secondary"}>
              Estado: {currentSubscriptionStatus}
            </Badge>
            <Badge variant={tenantView?.saas_trial_consumed_at ? "warning" : "outline"}>
              Trial consumido: {tenantView?.saas_trial_consumed_at ? "Sí" : "No"}
            </Badge>
            {tenantView?.saas_trial_consumed_at && (
              <Badge variant="outline">Fecha trial: {formatDateTime(tenantView.saas_trial_consumed_at)}</Badge>
            )}
            {saasSubscription?.mp_preapproval_id && (
              <Badge variant="outline" className="font-mono">Preapproval: {saasSubscription.mp_preapproval_id}</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Última sincronización: {saasLastSyncAt ? formatDateTime(saasLastSyncAt) : "sin registros"}</Badge>
            <Badge variant="outline">Fuente: {saasLastSyncSource || "sincronización pendiente"}</Badge>
            {pendingPlanTier && (
              <Badge variant={pendingPlanDue ? "warning" : "outline"}>
                Cambio programado: {getPlanLabel(pendingPlanTier as PlanTier)} ({pendingPlanEffectiveAt ? formatDateTime(pendingPlanEffectiveAt) : "sin fecha"})
              </Badge>
            )}
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => void reconcileSaasSubscription()} disabled={isSaasSyncing || isPending}>
                {isSaasSyncing && <Loader2 className="w-4 h-4 animate-spin" />}
                Sincronizar ahora
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <Label>1. Elige plan de suscripción</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {saasPlanOptions.map((planOption) => {
                const selected = saasPlanToSubscribe === planOption.id;
                return (
                  <button
                    key={planOption.id}
                    type="button"
                    onClick={() => setSaasPlanToSubscribe(planOption.id)}
                    disabled={!isOwner || isPending}
                    className={`rounded-lg border px-4 py-3 text-left transition ${selected ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{planOption.name}</p>
                      {selected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{planOption.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-sm font-medium">{planOption.priceLabel}</p>
                      {planOption.badge && <Badge variant="secondary">{planOption.badge}</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                2. {selectedIsDowngrade && !pendingPlanDue ? "Programar cambio a" : "Suscribirte a"}{" "}
                {saasPlanOptions.find((p) => p.id === saasPlanToSubscribe)?.name || "tu plan"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedIsDowngrade && !pendingPlanDue
                  ? "El downgrade se programa para el próximo ciclo y no corta tu plan actual."
                  : pendingPlanDue
                    ? "Tu cambio programado está listo para confirmarse en checkout."
                    : "Te enviaremos al checkout seguro de Mercado Pago para confirmar la suscripción recurrente."}
              </p>
            </div>
            {isOwner && (
              <Button onClick={startSaasSubscription} disabled={subscribeButtonDisabled}>
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {subscribeButtonLabel}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">En sandbox, usa comprador de prueba y valida activación en webhook.</p>
          {isSaasSyncing && <p className="text-xs text-blue-600">Verificando suscripción en Mercado Pago...</p>}

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Eventos SaaS recientes</p>
            {saasRecentEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin eventos recientes.</p>
            ) : (
              <div className="space-y-2">
                {saasRecentEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-md border p-2 text-xs flex flex-wrap items-center gap-2">
                    <Badge variant={event.processed ? "success" : "warning"}>{event.processed ? "processed" : "pending"}</Badge>
                    <Badge variant="outline">{event.event_topic}</Badge>
                    <span className="font-mono text-muted-foreground truncate max-w-[260px]">{event.event_resource_id}</span>
                    <span className="text-muted-foreground ml-auto">{formatDateTime(event.processed_at || event.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cobro a clientes */}
      <Card className={isMPConnected ? "border-green-500/30 bg-green-500/5" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-blue-500" />
            Cobro a mis clientes
            {isMPConnected ? (
              <Badge variant="success" className="ml-auto"><CheckCircle2 className="w-3 h-3 mr-1" />MP conectado</Badge>
            ) : (
              <Badge variant="warning" className="ml-auto"><AlertCircle className="w-3 h-3 mr-1" />MP no conectado</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configura cómo el bot cobra a tus compradores: OAuth de Mercado Pago, link externo global o transferencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="merchant_checkout_mode">Modo de cobro</Label>
            <select
              id="merchant_checkout_mode"
              value={merchantForm.merchant_checkout_mode}
              onChange={(e) => setMerchantForm((prev) => ({ ...prev, merchant_checkout_mode: e.target.value as MerchantCheckoutMode }))}
              disabled={!isOwner || isPending}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="bank_transfer">Transferencia bancaria</option>
              <option value="external_link">Link externo global</option>
              <option value="mp_oauth" disabled={!planAllowsMPOAuth}>
                Mercado Pago OAuth {planAllowsMPOAuth ? "" : "(solo Pro/Business/Enterprise)"}
              </option>
            </select>
          </div>

          {merchantForm.merchant_checkout_mode === "external_link" && (
            <div className="space-y-2">
              <Label htmlFor="merchant_external_checkout_url">URL checkout externo</Label>
              <Input
                id="merchant_external_checkout_url"
                value={merchantForm.merchant_external_checkout_url}
                onChange={(e) => setMerchantForm((prev) => ({ ...prev, merchant_external_checkout_url: e.target.value }))}
                placeholder="https://mi-checkout.com/pagar"
                disabled={!isOwner || isPending}
              />
            </div>
          )}

          <Separator />

          <div className="space-y-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Cobros ad-hoc (reservas / extras)</p>
              <p className="text-xs text-muted-foreground">Define si el bot crea links automáticamente, con aprobación o solo deja solicitud manual.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant_ad_hoc_link_mode">Modo ad-hoc</Label>
              <select
                id="merchant_ad_hoc_link_mode"
                value={merchantForm.merchant_ad_hoc_link_mode}
                onChange={(e) => setMerchantForm((prev) => ({ ...prev, merchant_ad_hoc_link_mode: e.target.value as MerchantAdHocLinkMode }))}
                disabled={!isOwner || isPending}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="manual">Manual (solo solicitud)</option>
                <option value="approval">Con aprobación</option>
                <option value="automatic">Automático</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="merchant_ad_hoc_max_amount_clp">Monto máximo CLP</Label>
                <Input
                  id="merchant_ad_hoc_max_amount_clp"
                  type="number"
                  min={1}
                  step={1}
                  value={String(merchantForm.merchant_ad_hoc_max_amount_clp)}
                  onChange={(e) => setMerchantForm((prev) => ({ ...prev, merchant_ad_hoc_max_amount_clp: Number(e.target.value || 0) }))}
                  disabled={!isOwner || isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="merchant_ad_hoc_expiry_minutes">Expiración (minutos)</Label>
                <Input
                  id="merchant_ad_hoc_expiry_minutes"
                  type="number"
                  min={5}
                  max={10080}
                  step={1}
                  value={String(merchantForm.merchant_ad_hoc_expiry_minutes)}
                  onChange={(e) => setMerchantForm((prev) => ({ ...prev, merchant_ad_hoc_expiry_minutes: Number(e.target.value || 60) }))}
                  disabled={!isOwner || isPending}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isMPConnected ? (
              <Button onClick={handleConnectMP} disabled={!isOwner || isPending || !planAllowsMPOAuth}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Conectar Mercado Pago OAuth
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleConnectMP} disabled={!isOwner || isPending || !planAllowsMPOAuth}>Reconectar OAuth</Button>
                <Button variant="destructive" onClick={handleDisconnectMP} disabled={!isOwner || isPending}>
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Desconectar OAuth
                </Button>
              </>
            )}
          </div>

          {!planAllowsMPOAuth && (
            <p className="text-xs text-amber-600">El plan Basic no permite OAuth de Mercado Pago. Usa link externo o transferencia.</p>
          )}

          {isOwner && (
            <Button variant="outline" onClick={saveMerchantCheckoutSettings} disabled={isPending}>Guardar modo de cobro</Button>
          )}
        </CardContent>
      </Card>

      {/* Datos bancarios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" />
            Datos de transferencia bancaria
          </CardTitle>
          <CardDescription>Se usa cuando el modo es transferencia o como respaldo del negocio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bank_details">Datos bancarios (banco, cuenta, RUT, nombre)</Label>
            <Textarea
              id="bank_details"
              value={bankDetails}
              onChange={(e) => setBankDetails(e.target.value)}
              placeholder={`Banco: BancoEstado\nTipo: Cuenta Corriente\nNúmero: 12345678\nRUT: 12.345.678-9\nNombre: Juan Pérez`}
              rows={5}
              disabled={!isOwner}
              className="font-mono text-sm"
            />
          </div>
          {isOwner && (
            <Button onClick={saveBankDetails} disabled={isPending} variant="outline">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar datos bancarios
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Cobros merchant */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Cobros Merchant (trazabilidad)
          </CardTitle>
          <CardDescription>Solicitudes y links ad-hoc recientes para seguimiento operativo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadMerchantLinks()} disabled={isMerchantLinksLoading || isPending}>
              {isMerchantLinksLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Actualizar
            </Button>
          </div>

          {isMerchantLinksLoading ? (
            <p className="text-sm text-muted-foreground">Cargando cobros...</p>
          ) : merchantLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cobros merchant registrados aún.</p>
          ) : (
            <div className="space-y-2">
              {merchantLinks.map((link) => {
                const statusVariant: "success" | "destructive" | "warning" | "outline" =
                  link.status === "paid" ? "success"
                    : link.status === "failed" || link.status === "rejected" ? "destructive"
                      : link.status === "pending_approval" ? "warning" : "outline";
                const isPendingApproval = link.status === "pending_approval";
                return (
                  <div key={link.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant}>{link.status}</Badge>
                      <Badge variant="outline">{link.mode_used}</Badge>
                      <Badge variant="outline">{formatMoneyCLP(link.amount_clp)}</Badge>
                      {link.mp_init_point && (
                        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link.mp_init_point || ""); toast.success("Link copiado."); }}>
                          Copiar link
                        </Button>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{link.title}</p>
                      {link.description && <p className="text-xs text-muted-foreground">{link.description}</p>}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span>Creado: {formatDateTime(link.created_at)}</span>
                      <span>Expira: {formatDateTime(link.expires_at)}</span>
                      {link.channel && <span>Canal: {link.channel}</span>}
                    </div>
                    {isPendingApproval && (isOwner || userRole === "admin") && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => approveMerchantLink(link.id)} disabled={isPending}>Aprobar y crear link</Button>
                        <Button size="sm" variant="outline" onClick={() => rejectMerchantLink(link.id)} disabled={isPending}>Rechazar</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
