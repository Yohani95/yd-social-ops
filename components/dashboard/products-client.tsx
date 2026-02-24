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
  X,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import type { Product, ProductCreate, ItemType } from "@/types";

interface ProductsClientProps {
  initialProducts: Product[];
  userRole: string;
  tenantId: string;
}

const emptyForm: ProductCreate & { keywordsText: string } = {
  name: "",
  description: "",
  price: 0,
  stock: 0,
  keywords: [],
  image_url: "",
  item_type: "product",
  keywordsText: "",
};

const ITEM_TYPE_LABELS: Record<ItemType, { label: string; badge: string }> = {
  product: { label: "Producto", badge: "Producto" },
  service: { label: "Servicio", badge: "Servicio" },
  info: { label: "Informativo", badge: "Info" },
};

export function ProductsClient({
  initialProducts,
  userRole,
}: ProductsClientProps) {
  const { tenant } = useDashboard();
  const businessType = tenant?.business_type || "products";
  const pageTitle = businessType === "products" ? "Productos" : businessType === "services" ? "Servicios" : businessType === "professional" ? "Áreas de atención" : "Catálogo";
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();

  const canEdit = userRole === "owner" || userRole === "admin";

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()) ||
      p.keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase()))
  );

  function openCreate() {
    setEditingProduct(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || "",
      price: product.price,
      stock: product.stock,
      keywords: product.keywords || [],
      image_url: product.image_url || "",
      item_type: product.item_type || "product",
      keywordsText: product.keywords?.join(", ") || "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingProduct(null);
    setForm(emptyForm);
  }

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "price" || name === "stock" ? Number(value) : value,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const keywords = form.keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const payload: ProductCreate = {
      name: form.name,
      description: form.description || null,
      price: form.item_type === "info" ? 0 : form.price,
      stock: form.item_type === "info" ? 0 : form.stock,
      keywords: keywords.length > 0 ? keywords : null,
      image_url: form.image_url || null,
      item_type: form.item_type,
    };

    startTransition(async () => {
      if (editingProduct) {
        const result = await updateProduct(editingProduct.id, payload);
        if (result.success && result.data) {
          setProducts((prev) =>
            prev.map((p) => (p.id === editingProduct.id ? result.data! : p))
          );
          toast.success("Producto actualizado");
          closeForm();
        } else {
          toast.error(result.error || "Error al actualizar");
        }
      } else {
        const result = await createProduct(payload);
        if (result.success && result.data) {
          setProducts((prev) => [result.data!, ...prev]);
          toast.success("Producto creado");
          closeForm();
        } else {
          toast.error(result.error || "Error al crear");
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
        toast.success("Producto eliminado");
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
          result.data.is_active ? "Producto activado" : "Producto desactivado"
        );
      } else {
        toast.error(result.error || "Error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1">
            {products.length} item{products.length !== 1 ? "s" : ""} en tu catálogo
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCsvImport(true)}>
              <FileSpreadsheet className="w-4 h-4" />
              Importar CSV
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Nuevo item
            </Button>
          </div>
        )}
      </div>

      {/* Formulario de crear/editar */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {editingProduct ? "Editar producto" : "Nuevo producto"}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={closeForm}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tipo de item */}
                <div className="space-y-2 sm:col-span-2">
                  <Label>Tipo</Label>
                  <div className="flex gap-2">
                    {(["product", "service", "info"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          form.item_type === t
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setForm((f) => ({ ...f, item_type: t }))}
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
                    placeholder={form.item_type === "product" ? "Ej: Polera negra talla M" : form.item_type === "service" ? "Ej: Cabaña para 4 personas" : "Ej: Derecho civil y familiar"}
                    required
                  />
                </div>

                {form.item_type !== "info" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="price">Precio (CLP) *</Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        min="0"
                        step="1"
                        value={form.price}
                        onChange={handleFormChange}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="stock">{form.item_type === "service" ? "Disponibilidad" : "Stock"}</Label>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        min="0"
                        step="1"
                        value={form.stock}
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
                  {editingProduct ? "Guardar cambios" : "Crear producto"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar productos..."
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
            {search ? "No se encontraron productos" : "No tienes productos aún"}
          </p>
          <p className="text-sm mt-1">
            {search
              ? "Prueba con otras palabras clave"
              : "Crea tu primer producto para que el bot pueda ofrecerlos"}
          </p>
          {!search && canEdit && (
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Crear primer producto
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
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
                  {product.item_type !== "info" ? (
                    <span className="text-xl font-bold">
                      {formatCurrency(product.price)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Informativo</span>
                  )}
                  <div className="flex gap-1.5">
                    {product.item_type && product.item_type !== "product" && (
                      <Badge variant="outline" className="text-[10px]">
                        {ITEM_TYPE_LABELS[product.item_type]?.badge || product.item_type}
                      </Badge>
                    )}
                    {product.item_type !== "info" && (
                      <Badge variant={product.stock > 0 ? "success" : "destructive"}>
                        {product.item_type === "service" ? `Disp: ${product.stock}` : `Stock: ${product.stock}`}
                      </Badge>
                    )}
                  </div>
                </div>

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
          ))}
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
