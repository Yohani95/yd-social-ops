"use client";

import { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { bulkCreateProducts } from "@/actions/products";
import type { ProductCreate } from "@/types";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedRow {
  name: string;
  price: number;
  stock: number;
  description: string;
  keywords: string[];
  valid: boolean;
  error?: string;
}

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  nombre: "name",
  name: "name",
  producto: "name",
  precio: "price",
  price: "price",
  stock: "stock",
  cantidad: "stock",
  descripcion: "description",
  description: "description",
  keywords: "keywords",
  "palabras clave": "keywords",
  etiquetas: "keywords",
  tags: "keywords",
};

function normalize(col: string): string {
  return col
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseRows(rawData: Record<string, string>[]): ParsedRow[] {
  if (!rawData.length) return [];

  const headers = Object.keys(rawData[0]);
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const key = normalize(h);
    if (COLUMN_MAP[key]) mapping[COLUMN_MAP[key]] = h;
  }

  if (!mapping.name) {
    const firstHeader = headers[0];
    if (firstHeader) mapping.name = firstHeader;
  }

  return rawData.map((row) => {
    const name = (row[mapping.name] || "").trim();
    const priceStr = row[mapping.price] || "0";
    const price = Math.max(0, Number(priceStr.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0);
    const stock = Math.max(0, Math.floor(Number(row[mapping.stock] || "0") || 0));
    const description = (row[mapping.description] || "").trim();
    const keywordsRaw = (row[mapping.keywords] || "").trim();
    const keywords = keywordsRaw ? keywordsRaw.split(/[,;|]/).map((k) => k.trim()).filter(Boolean) : [];

    const valid = !!name;
    return {
      name,
      price,
      stock,
      description,
      keywords,
      valid,
      error: !name ? "Sin nombre" : undefined,
    };
  });
}

export function CsvImportDialog({ open, onOpenChange, onImported }: CsvImportDialogProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete(results) {
        const parsed = parseRows(results.data as Record<string, string>[]);
        setRows(parsed);
      },
      error() {
        toast.error("Error al leer el archivo CSV");
      },
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    if (!validRows.length) return;
    setImporting(true);

    const products: ProductCreate[] = validRows.map((r) => ({
      name: r.name,
      description: r.description || null,
      price: r.price,
      stock: r.stock,
      keywords: r.keywords.length ? r.keywords : null,
      image_url: null,
      item_type: "product" as const,
    }));

    const result = await bulkCreateProducts(products);
    setImporting(false);

    if (result.success) {
      toast.success(`${result.data?.created} productos importados`);
      if (result.data?.errors.length) {
        toast.warning(`${result.data.errors.length} filas con errores`);
      }
      setRows([]);
      setFileName("");
      onOpenChange(false);
      onImported();
    } else {
      toast.error(result.error || "Error al importar");
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Importar productos desde CSV
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con columnas: nombre, precio, stock, descripcion, keywords
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Arrastra tu archivo CSV aquí</p>
            <p className="text-sm text-muted-foreground mt-1">o haz clic para seleccionar</p>
            <p className="text-xs text-muted-foreground mt-3">
              Formato: nombre, precio, stock, descripcion, keywords
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
                <Badge variant="secondary">{rows.length} filas</Badge>
                {validRows.length > 0 && (
                  <Badge variant="success">{validRows.length} válidos</Badge>
                )}
                {invalidRows.length > 0 && (
                  <Badge variant="destructive">{invalidRows.length} errores</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="w-4 h-4 mr-1" />
                Cambiar archivo
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Keywords</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 50).map((row, i) => (
                      <TableRow key={i} className={!row.valid ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{row.name || "—"}</TableCell>
                        <TableCell className="text-right text-sm">{row.price.toLocaleString("es-CL")}</TableCell>
                        <TableCell className="text-right text-sm">{row.stock}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {row.keywords.join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          {row.valid ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-destructive" aria-label={row.error || "Error"} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {rows.length > 50 && (
                <div className="text-center py-2 text-xs text-muted-foreground border-t">
                  Mostrando 50 de {rows.length} filas
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Upload className="w-4 h-4 mr-1" />
                )}
                Importar {validRows.length} productos
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
