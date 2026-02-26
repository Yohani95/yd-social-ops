"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { parseProductsFromText, completeSetupWizard } from "@/actions/setup";
import type { BotTone, BusinessType, ContactAction, ProductCreate } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const STEPS = [
  "Negocio",
  "Catalogo",
  "Contacto",
  "Bot",
  "Confirmar",
] as const;

const ASSISTANT_COPY: Record<number, string> = {
  1: "Define el tipo de negocio para ajustar la logica del bot (productos, servicios, profesional o mixto).",
  2: "Pega tu lista libre (lineas o comas). Voy a estructurarla para crear items listos para vender o reservar.",
  3: "Configura como quieres cerrar conversiones: link de pago, WhatsApp, email o mensaje personalizado.",
  4: "Elige nombre, tono y bienvenida del bot para que hable como tu negocio.",
  5: "Revisa todo y aplica. Luego prueba en el simulador para validar flujo real.",
};

export default function SetupPage() {
  const router = useRouter();
  const { tenant } = useDashboard();

  const [step, setStep] = useState(1);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsedProducts, setParsedProducts] = useState<ProductCreate[]>([]);

  const [businessName, setBusinessName] = useState(tenant?.business_name || "");
  const [businessType, setBusinessType] = useState<BusinessType>(tenant?.business_type || "products");
  const [businessDescription, setBusinessDescription] = useState(tenant?.business_description || "");
  const [catalogText, setCatalogText] = useState("");

  const [contactAction, setContactAction] = useState<ContactAction>(tenant?.contact_action || "payment_link");
  const [contactWhatsapp, setContactWhatsapp] = useState(tenant?.contact_whatsapp || "");
  const [contactEmail, setContactEmail] = useState(tenant?.contact_email || "");
  const [contactCustomMessage, setContactCustomMessage] = useState(tenant?.contact_custom_message || "");

  const [botName, setBotName] = useState(tenant?.bot_name || "Asistente");
  const [botTone, setBotTone] = useState<BotTone>(tenant?.bot_tone || "amigable");
  const [botWelcomeMessage, setBotWelcomeMessage] = useState(
    tenant?.bot_welcome_message || "Hola, en que puedo ayudarte hoy?"
  );

  const completion = Math.round((step / STEPS.length) * 100);
  const assistantMessage = ASSISTANT_COPY[step] || ASSISTANT_COPY[1];

  const canContinue = useMemo(() => {
    if (step === 1) return businessName.trim().length > 1;
    if (step === 2) return true;
    if (step === 3) {
      if (contactAction === "whatsapp_contact") return contactWhatsapp.trim().length >= 8;
      if (contactAction === "email_contact") return contactEmail.includes("@");
      if (contactAction === "custom_message") return contactCustomMessage.trim().length >= 6;
      return true;
    }
    if (step === 4) return botName.trim().length >= 2 && botWelcomeMessage.trim().length >= 6;
    return true;
  }, [step, businessName, contactAction, contactWhatsapp, contactEmail, contactCustomMessage, botName, botWelcomeMessage]);

  async function handleParseCatalog() {
    if (!catalogText.trim()) {
      toast.error("Pega texto para analizar");
      return;
    }

    setIsParsing(true);
    try {
      const result = await parseProductsFromText(catalogText, businessType);
      if (!result.success || !result.data) {
        toast.error(result.error || "No se pudo analizar el catalogo");
        setParsedProducts([]);
        setParseWarnings([]);
        return;
      }

      setParsedProducts(result.data.products);
      setParseWarnings(result.data.warnings || []);
      toast.success(`Se detectaron ${result.data.products.length} items`);
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCompleteSetup() {
    setIsSaving(true);
    try {
      const result = await completeSetupWizard({
        business_name: businessName,
        business_type: businessType,
        business_description: businessDescription,
        contact_action: contactAction,
        contact_whatsapp: contactWhatsapp,
        contact_email: contactEmail,
        contact_custom_message: contactCustomMessage,
        bot_name: botName,
        bot_tone: botTone,
        bot_welcome_message: botWelcomeMessage,
        products: parsedProducts,
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "No se pudo guardar el setup");
        return;
      }

      toast.success(
        `Setup aplicado. Productos creados: ${result.data.created_products}. Omitidos: ${result.data.skipped_products}.`
      );
      router.push("/dashboard/channels/simulator");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  function goNext() {
    if (!canContinue) {
      toast.error("Completa los datos requeridos para continuar");
      return;
    }
    setStep((current) => Math.min(STEPS.length, current + 1));
  }

  function goBack() {
    setStep((current) => Math.max(1, current - 1));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-5 h-5 sm:w-6 sm:h-6" />
            Setup Asistido
          </h1>
          <p className="text-muted-foreground mt-1">
            Onboarding en 5 pasos para dejar tu bot listo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-primary/50 hover:bg-primary/5 text-primary gap-2"
            onClick={() => router.push("/dashboard/setup/ai-chat")}
          >
            <Sparkles className="w-4 h-4" />
            Configurar con IA
          </Button>
          <Badge variant="outline">{completion}% completado</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Asistente de configuracion
            </CardTitle>
            <CardDescription>Paso {step} de {STEPS.length}: {STEPS[step - 1]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6">{assistantMessage}</p>
            <Separator />
            <div className="space-y-2">
              {STEPS.map((label, idx) => {
                const current = idx + 1;
                const done = current < step;
                const active = current === step;
                return (
                  <div
                    key={label}
                    className={`rounded-md border px-3 py-2 text-sm ${active ? "border-primary bg-primary/5" : done ? "border-green-400/40 bg-green-500/5" : "border-border"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      {done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Sparkles className="w-4 h-4 text-muted-foreground" />}
                      <span>{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paso {step}: {STEPS[step - 1]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="business_name">Nombre del negocio</Label>
                  <Input
                    id="business_name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ej: Cabanas del Lago"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de negocio</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: "products" as const, label: "Productos" },
                      { id: "services" as const, label: "Servicios" },
                      { id: "professional" as const, label: "Profesional" },
                      { id: "mixed" as const, label: "Mixto" },
                    ]).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-md border px-3 py-2 text-left text-sm ${businessType === option.id ? "border-primary bg-primary/10" : "hover:border-primary/50"
                          }`}
                        onClick={() => setBusinessType(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business_description">Descripcion (opcional)</Label>
                  <Textarea
                    id="business_description"
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe en una frase que vendes o que servicios ofreces"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="catalog_text">Pega tu catalogo en texto libre</Label>
                  <Textarea
                    id="catalog_text"
                    rows={7}
                    value={catalogText}
                    onChange={(e) => setCatalogText(e.target.value)}
                    placeholder="Ej: Cabana Roble 4 personas 35000 la noche, Cabana Pino 6 personas 50000 incluye kayak"
                  />
                  <p className="text-xs text-muted-foreground">
                    Puedes usar comas o saltos de linea. El parser detecta nombre, precio y tipo.
                  </p>
                </div>
                <Button onClick={handleParseCatalog} disabled={isParsing}>
                  {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Analizar texto
                </Button>

                {parseWarnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm font-medium">Advertencias</p>
                    <ul className="text-xs mt-1 space-y-1 list-disc pl-5">
                      {parseWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedProducts.length > 0 && (
                  <div className="rounded-md border">
                    <div className="px-3 py-2 border-b text-sm font-medium">
                      Preview ({parsedProducts.length} items)
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {parsedProducts.map((product, index) => (
                        <div key={`${product.name}-${index}`} className="px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{product.name}</span>
                            <Badge variant="outline">{product.item_type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Precio: {product.price} | Stock: {product.stock} | Unidad: {product.unit_label || "unidad"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Como quieres cerrar ventas/reservas</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {([
                      { id: "payment_link" as const, label: "Link de pago / transferencia" },
                      { id: "whatsapp_contact" as const, label: "Enviar a WhatsApp" },
                      { id: "email_contact" as const, label: "Enviar a Email" },
                      { id: "custom_message" as const, label: "Mensaje personalizado" },
                    ]).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-md border px-3 py-2 text-left text-sm ${contactAction === option.id ? "border-primary bg-primary/10" : "hover:border-primary/50"
                          }`}
                        onClick={() => setContactAction(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {contactAction === "whatsapp_contact" && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_whatsapp">WhatsApp</Label>
                    <Input
                      id="contact_whatsapp"
                      value={contactWhatsapp}
                      onChange={(e) => setContactWhatsapp(e.target.value)}
                      placeholder="+56912345678"
                    />
                  </div>
                )}

                {contactAction === "email_contact" && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Email</Label>
                    <Input
                      id="contact_email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="ventas@tu-dominio.com"
                    />
                  </div>
                )}

                {contactAction === "custom_message" && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_custom_message">Mensaje personalizado</Label>
                    <Textarea
                      id="contact_custom_message"
                      rows={3}
                      value={contactCustomMessage}
                      onChange={(e) => setContactCustomMessage(e.target.value)}
                      placeholder="Para reservar, escribenos por WhatsApp..."
                    />
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bot_name">Nombre del bot</Label>
                  <Input
                    id="bot_name"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="Ej: Sofia"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tono</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { id: "formal" as const, label: "Formal" },
                      { id: "amigable" as const, label: "Amigable" },
                      { id: "informal" as const, label: "Informal" },
                    ]).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-md border px-3 py-2 text-sm ${botTone === option.id ? "border-primary bg-primary/10" : "hover:border-primary/50"
                          }`}
                        onClick={() => setBotTone(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot_welcome">Mensaje de bienvenida</Label>
                  <Textarea
                    id="bot_welcome"
                    rows={3}
                    value={botWelcomeMessage}
                    onChange={(e) => setBotWelcomeMessage(e.target.value)}
                    placeholder="Hola, bienvenido. En que puedo ayudarte?"
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div className="rounded-md border p-4">
                  <p className="font-medium">{businessName || "-"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tipo: {businessType} | Contacto: {contactAction}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bot: {botName} ({botTone})
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Items listos para crear: {parsedProducts.length}
                  </p>
                </div>
                <Button onClick={handleCompleteSetup} disabled={isSaving} className="w-full sm:w-auto">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Aplicar setup y abrir simulador
                </Button>
              </div>
            )}

            <Separator />

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <Button variant="outline" onClick={goBack} disabled={step === 1 || isSaving}>
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>

              {step < STEPS.length ? (
                <Button onClick={goNext} disabled={!canContinue || isSaving}>
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Revisa y aplica para finalizar
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
