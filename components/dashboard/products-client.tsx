"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Package,
  Edit,
  Trash2,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  Tag,
  FileSpreadsheet,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DashboardModuleHeader } from "@/components/dashboard/module-header";
import { toast } from "sonner";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
} from "@/actions/products";
import { CsvImportDialog } from "@/components/dashboard/csv-import-dialog";
import { formatCurrency } from "@/lib/utils";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type {
  AvailabilityType,
  CatalogProfile,
  ItemType,
  PricingMode,
  Product,
  ProductCreate,
} from "@/types";

interface ProductsClientProps {
  initialProducts: Product[];
  userRole: string;
  tenantId: string;
}

type ProductForm = ProductCreate & {
  keywordsText: string;
  pricing_mode: PricingMode;
  availability_type: AvailabilityType;
  unit_label: string;
  deliveryZonesText: string;
  etaMinText: string;
  etaMaxText: string;
  deliveryFeeText: string;
  serviceDurationText: string;
  serviceKindText: string;
};

interface ServiceContextMeta {
  kindDefault: string;
  kindPlaceholder: string;
  kindHelper: string;
  durationLabel: string;
  durationPlaceholder: string;
  durationHelper: string;
  unitSuggestion: string;
  availabilityHint: string;
}

const ITEM_TYPE_LABELS: Record<ItemType, { label: string; badge: string }> = {
  product: { label: "Producto", badge: "Producto" },
  service: { label: "Servicio", badge: "Servicio" },
  info: { label: "Informativo", badge: "Info" },
  delivery: { label: "Delivery", badge: "Delivery" },
};

const PRICING_LABELS: Record<PricingMode, string> = {
  fixed: "Precio fijo",
  from: "Desde",
  quote: "A cotizar",
  free: "Sin costo",
};

const PROFILE_META: Record<CatalogProfile, { label: string; helper: string }> = {
  generic: { label: "Catalogo mixto", helper: "Combina productos, servicios e informacion en un mismo flujo." },
  restaurant: { label: "Restaurante", helper: "Incluye delivery para pedidos y servicios para reservas." },
  dental: { label: "Dental", helper: "Prioriza servicios con agenda y fichas informativas." },
  lodging: { label: "Hospedaje", helper: "Usa servicios con agenda, cupos y reglas de reserva." },
  support: { label: "Soporte", helper: "Combina servicios y contenido informativo por etapa." },
  delivery: { label: "Delivery", helper: "Configura zonas, tiempos de entrega y costo de despacho." },
};

const SERVICE_CONTEXT: Record<CatalogProfile, ServiceContextMeta> = {
  generic: {
    kindDefault: "Servicio general",
    kindPlaceholder: "Ej: Consulta inicial",
    kindHelper: "Define el tipo para que el bot entienda exactamente que servicio vendes.",
    durationLabel: "Duracion estimada (minutos, opcional)",
    durationPlaceholder: "45",
    durationHelper: "Si no aplica una duracion fija, deja este campo vacio.",
    unitSuggestion: "cupo",
    availabilityHint: "Usa Agenda para turnos por horario y Cupos para bloques limitados.",
  },
  restaurant: {
    kindDefault: "Reserva de mesa",
    kindPlaceholder: "Ej: Reserva cena, Evento privado",
    kindHelper: "Diferencia reservas normales de eventos o experiencias especiales.",
    durationLabel: "Duracion de la reserva (minutos, opcional)",
    durationPlaceholder: "90",
    durationHelper: "Ejemplo: 90 min para una reserva estandar.",
    unitSuggestion: "reserva",
    availabilityHint: "Agenda funciona bien para reservas por horario; Cupos para turnos por bloque.",
  },
  dental: {
    kindDefault: "Consulta dental",
    kindPlaceholder: "Ej: Limpieza, Ortodoncia, Control",
    kindHelper: "Te ayuda a separar especialidades y tiempos de atencion por procedimiento.",
    durationLabel: "Duracion de atencion (minutos, opcional)",
    durationPlaceholder: "45",
    durationHelper: "Ejemplo: 30-60 min segun tratamiento.",
    unitSuggestion: "paciente",
    availabilityHint: "Agenda por horario suele ser la opcion mas clara para clinicas.",
  },
  lodging: {
    kindDefault: "Estadia en cabana",
    kindPlaceholder: "Ej: Cabana familiar, Suite premium",
    kindHelper: "Define tipo de cabana/habitacion para manejar disponibilidad por categoria.",
    durationLabel: "Duracion base (minutos, opcional)",
    durationPlaceholder: "1440",
    durationHelper: "Una noche equivale a 1440 minutos.",
    unitSuggestion: "noche",
    availabilityHint: "Para hospedaje puedes usar Cupos por tipo de unidad o Disponibilidad total.",
  },
  support: {
    kindDefault: "Atencion de soporte",
    kindPlaceholder: "Ej: Soporte tecnico, Mesa de ayuda",
    kindHelper: "Separa soporte por nivel o tipo de requerimiento.",
    durationLabel: "SLA objetivo (minutos, opcional)",
    durationPlaceholder: "30",
    durationHelper: "Tiempo objetivo de primera respuesta o resolucion.",
    unitSuggestion: "ticket",
    availabilityHint: "Cupos permite controlar carga de atenciones por bloque o jornada.",
  },
  delivery: {
    kindDefault: "Servicio logistico",
    kindPlaceholder: "Ej: Reparto urbano, Envio express",
    kindHelper: "Define que modalidad de despacho aplica para cada caso.",
    durationLabel: "Duracion estimada (minutos, opcional)",
    durationPlaceholder: "60",
    durationHelper: "Puedes dejar vacio si solo manejas ETA por zona.",
    unitSuggestion: "pedido",
    availabilityHint: "Para delivery prioriza Cupos o Capacidad fija segun tu operacion.",
  },
};

function getServiceContext(profile: CatalogProfile): ServiceContextMeta {
  return SERVICE_CONTEXT[profile] || SERVICE_CONTEXT.generic;
}

function defaultPricingMode(itemType: ItemType): PricingMode {
  if (itemType === "info") return "free";
  if (itemType === "service") return "from";
  return "fixed";
}

function defaultAvailability(itemType: ItemType): AvailabilityType {
  if (itemType === "service") return "calendar";
  if (itemType === "delivery") return "quota";
  return "stock";
}

function defaultUnit(itemType: ItemType, catalogProfile: CatalogProfile = "generic"): string {
  if (itemType === "service") return getServiceContext(catalogProfile).unitSuggestion;
  if (itemType === "delivery") return "pedido";
  if (itemType === "info") return "info";
  return "unidad";
}

function serviceCapacityLabel(profile: CatalogProfile, availability: AvailabilityType): string {
  if (profile === "dental") {
    if (availability === "calendar") return "Pacientes por agenda";
    if (availability === "quota") return "Pacientes por bloque";
    return "Capacidad total de atencion";
  }
  if (profile === "lodging") {
    if (availability === "calendar") return "Check-ins por agenda";
    if (availability === "quota") return "Unidades por bloque";
    return "Unidades disponibles";
  }
  if (profile === "restaurant") {
    if (availability === "calendar") return "Reservas por horario";
    if (availability === "quota") return "Mesas por bloque";
    return "Capacidad total de reservas";
  }
  if (profile === "support") {
    if (availability === "calendar") return "Atenciones por agenda";
    if (availability === "quota") return "Tickets por bloque";
    return "Capacidad total de soporte";
  }
  if (profile === "delivery") {
    if (availability === "calendar") return "Despachos por agenda";
    if (availability === "quota") return "Pedidos por bloque";
    return "Capacidad total de pedidos";
  }

  if (availability === "calendar") return "Cupos por agenda";
  if (availability === "quota") return "Cupos por bloque";
  return "Disponibilidad total";
}

function serviceCapacityHelper(profile: CatalogProfile, availability: AvailabilityType): string {
  if (profile === "dental") {
    return availability === "calendar"
      ? "Define cuantos pacientes puede atender cada profesional por horario."
      : "Controla la demanda maxima por turno para evitar sobrecupos.";
  }
  if (profile === "lodging") {
    return availability === "stock"
      ? "Representa cuantas cabanas/habitaciones reales quedan disponibles."
      : "Usa este valor para gestionar ocupacion por temporada o bloque.";
  }
  if (profile === "delivery") {
    return "Define la capacidad operativa real de despacho para este servicio.";
  }
  return "Define la capacidad real que tu equipo puede atender para este servicio.";
}

function createEmptyForm(catalogProfile: CatalogProfile): ProductForm {
  const serviceContext = getServiceContext(catalogProfile);
  return {
    name: "",
    description: "",
    price: 0,
    stock: 0,
    keywords: [],
    image_url: "",
    item_type: "product",
    pricing_mode: "fixed",
    availability_type: "stock",
    unit_label: defaultUnit("product", catalogProfile),
    attributes: {},
    keywordsText: "",
    deliveryZonesText: "",
    etaMinText: "",
    etaMaxText: "",
    deliveryFeeText: "",
    serviceDurationText: "",
    serviceKindText: serviceContext.kindDefault,
  };
}

export function ProductsClient({
  initialProducts,
  userRole,
}: ProductsClientProps) {
  const { tenant } = useDashboard();
  const businessType = tenant?.business_type || "products";
  const pageTitle =
    businessType === "products"
      ? "Productos"
      : businessType === "services"
        ? "Servicios"
        : businessType === "professional"
          ? "Areas de atencion"
          : "Catalogo";
  const catalogProfile = (tenant?.catalog_profile || "generic") as CatalogProfile;
  const profileInfo = PROFILE_META[catalogProfile] || PROFILE_META.generic;
  const serviceContext = getServiceContext(catalogProfile);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(() => createEmptyForm(catalogProfile));
  const [isPending, startTransition] = useTransition();

  const canEdit = userRole === "owner" || userRole === "admin";

  function parseProductAttributes(product: Product): Record<string, unknown> {
    if (product.attributes && typeof product.attributes === "object" && !Array.isArray(product.attributes)) {
      return product.attributes;
    }
    return {};
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()) ||
      p.keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase()))
  );

  function openCreate() {
    setEditingProduct(null);
    setForm(createEmptyForm(catalogProfile));
    setShowForm(true);
  }

  function openEdit(product: Product) {
    const attributes = parseProductAttributes(product);
    const deliveryZones = Array.isArray(attributes.delivery_zones)
      ? (attributes.delivery_zones as unknown[]).map((zone) => String(zone).trim()).filter(Boolean).join(", ")
      : "";

    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || "",
      price: product.price,
      stock: product.stock,
      keywords: product.keywords || [],
      image_url: product.image_url || "",
      item_type: product.item_type || "product",
      pricing_mode: product.pricing_mode || defaultPricingMode(product.item_type || "product"),
      availability_type: product.availability_type || defaultAvailability(product.item_type || "product"),
      unit_label: product.unit_label || defaultUnit(product.item_type || "product", catalogProfile),
      attributes,
      keywordsText: product.keywords?.join(", ") || "",
      deliveryZonesText: deliveryZones,
      etaMinText: String(attributes.eta_min_minutes || ""),
      etaMaxText: String(attributes.eta_max_minutes || ""),
      deliveryFeeText: String(attributes.delivery_fee || ""),
      serviceDurationText: String(attributes.duration_minutes || ""),
      serviceKindText: String(attributes.service_kind || serviceContext.kindDefault),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingProduct(null);
    setForm(createEmptyForm(catalogProfile));
  }

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    const numericFields = ["price", "stock"];
    setForm((prev) => ({
      ...prev,
      [name]: numericFields.includes(name) ? Number(value) : value,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const keywords = form.keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const pricingMode = form.item_type === "info" ? "free" : form.pricing_mode || defaultPricingMode(form.item_type);
    const attributes: Record<string, unknown> = {};
    if (form.item_type === "delivery") {
      const zones = form.deliveryZonesText
        .split(",")
        .map((zone) => zone.trim())
        .filter(Boolean);
      if (zones.length > 0) attributes.delivery_zones = zones;

      const etaMin = Number(form.etaMinText || 0);
      const etaMax = Number(form.etaMaxText || 0);
      const fee = Number(form.deliveryFeeText || 0);
      if (Number.isFinite(etaMin) && etaMin > 0) attributes.eta_min_minutes = Math.round(etaMin);
      if (Number.isFinite(etaMax) && etaMax > 0) attributes.eta_max_minutes = Math.round(etaMax);
      if (Number.isFinite(fee) && fee >= 0) attributes.delivery_fee = Math.round(fee);
    }
    if (form.item_type === "service") {
      const duration = Number(form.serviceDurationText || 0);
      if (Number.isFinite(duration) && duration > 0) attributes.duration_minutes = Math.round(duration);
      const serviceKind = form.serviceKindText.trim();
      if (serviceKind) attributes.service_kind = serviceKind;
    }

    const payload: ProductCreate = {
      name: form.name,
      description: form.description || null,
      price: form.item_type === "info" || pricingMode === "free" ? 0 : form.price,
      stock: form.item_type === "info" ? 0 : form.stock,
      keywords: keywords.length > 0 ? keywords : null,
      image_url: form.image_url || null,
      item_type: form.item_type,
      pricing_mode: pricingMode,
      availability_type:
        form.item_type === "service" || form.item_type === "delivery"
          ? form.availability_type || defaultAvailability(form.item_type)
          : "stock",
      unit_label: form.unit_label || defaultUnit(form.item_type, catalogProfile),
      attributes,
    };

    startTransition(async () => {
      if (editingProduct) {
        const result = await updateProduct(editingProduct.id, payload);
        if (result.success && result.data) {
          setProducts((prev) =>
            prev.map((p) => (p.id === editingProduct.id ? result.data! : p))
          );
          toast.success("Item actualizado");
          closeForm();
        } else {
          toast.error(result.error || "Error al actualizar item");
        }
      } else {
        const result = await createProduct(payload);
        if (result.success && result.data) {
          setProducts((prev) => [result.data!, ...prev]);
          toast.success("Item creado");
          closeForm();
        } else {
          toast.error(result.error || "Error al crear item");
        }
      }
    });
  }

  function handleDelete(product: Product) {
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`))
      return;

    startTransition(async () => {
      const result = await deleteProduct(product.id);
      if (result.success) {
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        toast.success("Item eliminado");
      } else {
        toast.error(result.error || "Error al eliminar");
      }
    });
  }

  function toggleActive(product: Product) {
    startTransition(async () => {
      const result = await updateProduct(product.id, {
        is_active: !product.is_active,
      });
      if (result.success && result.data) {
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? result.data! : p))
        );
        toast.success(
          result.data.is_active ? "Item activado" : "Item desactivado"
        );
      } else {
        toast.error(result.error || "Error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <DashboardModuleHeader
        domain="catalog"
        icon={Package}
        title={pageTitle}
        description="Catalogo flexible por tipo de negocio: productos, servicios y delivery con capacidad y disponibilidad contextual."
        meta={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {profileInfo.label}
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              {products.length} item{products.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        )}
        actions={canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowCsvImport(true)}>
              <FileSpreadsheet className="w-4 h-4" />
              Importar CSV
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Nuevo item
            </Button>
          </div>
        ) : null}
      />

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Modo de catalogo: {profileInfo.label}</CardTitle>
            <Badge variant="secondary">{catalogProfile}</Badge>
          </div>
          <CardDescription>{profileInfo.helper}</CardDescription>
        </CardHeader>
      </Card>

      {/* Formulario de crear/editar en popup */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Editar item" : "Nuevo item"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tipo de item */}
                <div className="space-y-2 sm:col-span-2">
                  <Label>Tipo</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["product", "service", "info", "delivery"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`min-h-[40px] rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          form.item_type === t
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            item_type: t,
                            pricing_mode: defaultPricingMode(t),
                            availability_type: defaultAvailability(t),
                            unit_label:
                              t === "service"
                                ? defaultUnit("service", catalogProfile)
                                : f.unit_label?.trim()
                                  ? f.unit_label
                                  : defaultUnit(t, catalogProfile),
                            price: t === "info" ? 0 : f.price,
                            stock: t === "info" ? 0 : f.stock,
                            serviceKindText:
                              t === "service"
                                ? f.serviceKindText?.trim() || serviceContext.kindDefault
                                : f.serviceKindText,
                          }))
                        }
                      >
                        {ITEM_TYPE_LABELS[t].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={form.name}
                    onChange={handleFormChange}
                    placeholder={
                      form.item_type === "product"
                        ? "Ej: Polera negra talla M"
                        : form.item_type === "service"
                          ? `Ej: ${serviceContext.kindDefault}`
                          : form.item_type === "delivery"
                            ? "Ej: Pedido menu ejecutivo"
                            : "Ej: Politica de devoluciones"
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pricing_mode">Modo de precio</Label>
                  <select
                    id="pricing_mode"
                    name="pricing_mode"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.item_type === "info" ? "free" : form.pricing_mode}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, pricing_mode: e.target.value as PricingMode }))
                    }
                    disabled={form.item_type === "info"}
                  >
                    {(["fixed", "from", "quote", "free"] as const).map((mode) => (
                      <option key={mode} value={mode}>
                        {PRICING_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                </div>

                {form.item_type !== "info" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="price">Precio (CLP)</Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        min="0"
                        step="1"
                        value={form.pricing_mode === "free" ? 0 : form.price}
                        onChange={handleFormChange}
                        required={form.pricing_mode !== "quote"}
                        disabled={form.pricing_mode === "free"}
                      />
                    </div>

                    {(form.item_type === "service" || form.item_type === "delivery") && (
                      <div className="space-y-2">
                        <Label htmlFor="availability_type">Disponibilidad</Label>
                        <select
                          id="availability_type"
                          name="availability_type"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={form.availability_type}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              availability_type: e.target.value as AvailabilityType,
                            }))
                          }
                        >
                          {form.item_type === "service" ? (
                            <>
                              <option value="calendar">Agenda por horario</option>
                              <option value="quota">Cupos por bloque</option>
                              <option value="stock">Disponibilidad total</option>
                            </>
                          ) : (
                            <>
                              <option value="quota">Cupos de pedidos</option>
                              <option value="stock">Capacidad fija</option>
                            </>
                          )}
                        </select>
                        {form.item_type === "service" ? (
                          <p className="text-xs text-muted-foreground">{serviceContext.availabilityHint}</p>
                        ) : null}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="stock">
                        {form.item_type === "service"
                          ? serviceCapacityLabel(catalogProfile, form.availability_type)
                          : form.item_type === "delivery"
                            ? catalogProfile === "delivery"
                              ? "Capacidad operativa de pedidos"
                              : "Capacidad de pedidos"
                            : "Stock"}
                      </Label>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        min="0"
                        step="1"
                        value={form.stock}
                        onChange={handleFormChange}
                      />
                      {form.item_type === "service" ? (
                        <p className="text-xs text-muted-foreground">
                          {serviceCapacityHelper(catalogProfile, form.availability_type)}
                        </p>
                      ) : form.item_type === "delivery" ? (
                        <p className="text-xs text-muted-foreground">
                          Define la capacidad real de despacho para este servicio de delivery.
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="unit_label">Unidad</Label>
                      <Input
                        id="unit_label"
                        name="unit_label"
                        value={form.unit_label}
                        onChange={handleFormChange}
                        placeholder={defaultUnit(form.item_type, catalogProfile)}
                      />
                    </div>
                  </>
                )}

                {form.item_type === "service" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="serviceKindText">Tipo de servicio</Label>
                      <Input
                        id="serviceKindText"
                        name="serviceKindText"
                        value={form.serviceKindText}
                        onChange={handleFormChange}
                        placeholder={serviceContext.kindPlaceholder}
                      />
                      <p className="text-xs text-muted-foreground">{serviceContext.kindHelper}</p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="serviceDurationText">{serviceContext.durationLabel}</Label>
                      <Input
                        id="serviceDurationText"
                        name="serviceDurationText"
                        type="number"
                        min="0"
                        step="1"
                        value={form.serviceDurationText}
                        onChange={handleFormChange}
                        placeholder={serviceContext.durationPlaceholder}
                      />
                      <p className="text-xs text-muted-foreground">{serviceContext.durationHelper}</p>
                    </div>
                  </>
                )}

                {form.item_type === "delivery" && (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="deliveryZonesText">Zonas de reparto (coma separada)</Label>
                      <Input
                        id="deliveryZonesText"
                        name="deliveryZonesText"
                        value={form.deliveryZonesText}
                        onChange={handleFormChange}
                        placeholder="Centro, Norte, Sur"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="etaMinText">ETA minimo (min)</Label>
                      <Input
                        id="etaMinText"
                        name="etaMinText"
                        type="number"
                        min="0"
                        step="1"
                        value={form.etaMinText}
                        onChange={handleFormChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="etaMaxText">ETA maximo (min)</Label>
                      <Input
                        id="etaMaxText"
                        name="etaMaxText"
                        type="number"
                        min="0"
                        step="1"
                        value={form.etaMaxText}
                        onChange={handleFormChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deliveryFeeText">Costo despacho (CLP)</Label>
                      <Input
                        id="deliveryFeeText"
                        name="deliveryFeeText"
                        type="number"
                        min="0"
                        step="1"
                        value={form.deliveryFeeText}
                        onChange={handleFormChange}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={form.description || ""}
                    onChange={handleFormChange}
                    placeholder="Descripción detallada del producto..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="keywordsText">
                    <Tag className="w-3.5 h-3.5 inline mr-1" />
                    Palabras clave (separadas por coma)
                  </Label>
                  <Input
                    id="keywordsText"
                    name="keywordsText"
                    value={form.keywordsText}
                    onChange={handleFormChange}
                    placeholder="polera, negra, talla M, algodón"
                  />
                  <p className="text-xs text-muted-foreground">
                    El bot usará estas palabras para identificar el producto en la conversación
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="image_url">URL de imagen</Label>
                  <Input
                    id="image_url"
                    name="image_url"
                    value={form.image_url || ""}
                    onChange={handleFormChange}
                    placeholder="https://..."
                    type="url"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {editingProduct ? "Guardar cambios" : "Crear item"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancelar
                </Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar items..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Lista de productos */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {search ? "No se encontraron items" : "No tienes items aun"}
          </p>
          <p className="text-sm mt-1">
            {search
              ? "Prueba con otras palabras clave"
              : "Crea tu primer item para que el bot pueda vender, reservar o informar"}
          </p>
          {!search && canEdit && (
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Crear primer item
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const attributes = parseProductAttributes(product);
            const deliveryZones = Array.isArray(attributes.delivery_zones)
              ? (attributes.delivery_zones as unknown[]).map((zone) => String(zone).trim()).filter(Boolean)
              : [];
            const serviceKind = String(attributes.service_kind || "").trim();
            const stockBadgeLabel =
              product.item_type === "service"
                ? product.availability_type === "calendar"
                  ? `Agenda: ${product.stock}`
                  : product.availability_type === "quota"
                    ? `Cupos: ${product.stock}`
                    : `Disp.: ${product.stock}`
                : product.item_type === "delivery"
                  ? `Pedidos: ${product.stock}`
                  : `Stock: ${product.stock}`;
            return (
            <Card
              key={product.id}
              className={!product.is_active ? "opacity-60" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">
                    {product.name}
                  </CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    {product.is_active ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {product.description && (
                  <CardDescription className="line-clamp-2">
                    {product.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  {product.item_type !== "info" && product.pricing_mode !== "free" ? (
                    <span className="text-xl font-bold">
                      {formatCurrency(product.price)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Sin costo</span>
                  )}
                  <div className="flex gap-1.5">
                    {product.item_type && product.item_type !== "product" && (
                      <Badge variant="outline" className="text-[10px]">
                        {ITEM_TYPE_LABELS[product.item_type]?.badge || product.item_type}
                      </Badge>
                    )}
                    {product.pricing_mode && (
                      <Badge variant="secondary" className="text-[10px]">
                        {PRICING_LABELS[product.pricing_mode as PricingMode]}
                      </Badge>
                    )}
                    {product.item_type === "service" && serviceKind ? (
                      <Badge variant="outline" className="text-[10px]">
                        {serviceKind}
                      </Badge>
                    ) : null}
                    {product.item_type !== "info" && (
                      <Badge variant={product.stock > 0 ? "success" : "destructive"}>
                        {stockBadgeLabel}
                      </Badge>
                    )}
                  </div>
                </div>

                {product.item_type === "delivery" && (
                  <p className="text-xs text-muted-foreground">
                    Zonas: {deliveryZones.length > 0 ? deliveryZones.join(", ") : "sin definir"}
                  </p>
                )}

                {product.item_type === "service" && attributes.duration_minutes != null && (
                  <p className="text-xs text-muted-foreground">
                    Duracion: {String(attributes.duration_minutes)} min
                  </p>
                )}

                {product.keywords && product.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.keywords.slice(0, 4).map((kw) => (
                      <Badge key={kw} variant="outline" className="text-[10px]">
                        {kw}
                      </Badge>
                    ))}
                    {product.keywords.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{product.keywords.length - 4}
                      </Badge>
                    )}
                  </div>
                )}

                {canEdit && (
                  <>
                    <Separator />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openEdit(product)}
                        disabled={isPending}
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(product)}
                        disabled={isPending}
                        title={product.is_active ? "Desactivar" : "Activar"}
                      >
                        {product.is_active ? (
                          <AlertCircle className="w-3.5 h-3.5" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(product)}
                        disabled={isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )})}
        </div>
      )}

      <CsvImportDialog
        open={showCsvImport}
        onOpenChange={setShowCsvImport}
        onImported={async () => {
          const fresh = await getProducts();
          setProducts(fresh);
        }}
      />
    </div>
  );
}

