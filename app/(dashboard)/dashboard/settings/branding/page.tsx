"use client";

import { useState } from "react";
import { Wand2, Image as ImageIcon, Save, Loader2, Link2 } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { updateBranding } from "@/actions/branding";

export default function BrandingSettingsPage() {
    const { tenant } = useDashboard();
    const [isSaving, setIsSaving] = useState(false);

    // States inicializados con los valores del tenant
    const [name, setName] = useState(tenant?.white_label_name || "");
    const [logo, setLogo] = useState(tenant?.white_label_logo || "");
    const [color, setColor] = useState(tenant?.white_label_primary_color || "#3b82f6");

    const isEnterprise = tenant?.plan_tier === "enterprise" || tenant?.plan_tier === "enterprise_plus";

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        const result = await updateBranding({
            name: name.trim(),
            logo: logo.trim(),
            primaryColor: color
        });

        if (result.success) {
            toast.success("Ajustes de marca actualizados. Algunos cambios pueden requerir refrescar la página.");
        } else {
            toast.error(result.error || "Error al actualizar la marca");
        }

        setIsSaving(false);
    };

    if (!isEnterprise) {
        return (
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Wand2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Marca Propia</h1>
                        <p className="text-muted-foreground">Personaliza el dashboard y enlaces con tu marca.</p>
                    </div>
                </div>
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wand2 className="w-5 h-5 text-primary" />
                            Función Enterprise+
                        </CardTitle>
                        <CardDescription>
                            La opción de White-label permite ocultar las menciones de "YD Social Ops", cambiar el nombre
                            principal del sistema, subir tu propio logo e inyectar el sistema operativo directamente
                            bajo la identidad corporativa de tu negocio.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button variant="default">Mejorar Plan</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Wand2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Marca Propia</h1>
                    <p className="text-muted-foreground">Configura el sistema operativo corporativo bajo tu propia identidad.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
                <form onSubmit={handleSave}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Ajustes de White-label</CardTitle>
                            <CardDescription>
                                Los cambios se reflejarán en todo el dashboard y en las interacciones
                                públicas de tu asistente.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            <div className="space-y-2">
                                <Label htmlFor="brandName">Nombre de la Empresa</Label>
                                <Input
                                    id="brandName"
                                    placeholder="Ej: Agencia CRM Pro"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Reemplazará "YD Social Ops" en el menú principal izquierdo.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="brandLogo">URL del Logo Comercial</Label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="brandLogo"
                                            placeholder="https://tudominio.com/logo.png"
                                            className="pl-9"
                                            value={logo}
                                            onChange={e => setLogo(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Formatos recomendados: PNG o SVG transparente. Relación de aspecto recomendada 1:1 o 2:1.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="brandColor">Color Primario</Label>
                                <div className="flex gap-4 items-center">
                                    <Input
                                        id="brandColor"
                                        type="color"
                                        className="w-16 h-10 p-1 cursor-pointer"
                                        value={color}
                                        onChange={e => setColor(e.target.value)}
                                    />
                                    <Input
                                        value={color}
                                        onChange={e => setColor(e.target.value)}
                                        className="w-28 uppercase font-mono text-sm"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Se utilizará para los links de reserva y ciertos acentos visuales (requiere refresco).
                                </p>
                            </div>

                        </CardContent>
                        <CardFooter className="border-t bg-muted/20 px-6 py-4">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" /> Guardar Cambios
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </form>

                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-sm">Vista Previa (Header)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border p-4 bg-sidebar">
                                <div className="flex items-center gap-2 border-b border-sidebar-border pb-3">
                                    {logo ? (
                                        <img src={logo} alt="Logo Prev" className="w-8 h-8 rounded-lg object-contain bg-white" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                            <ImageIcon className="w-4 h-4 text-primary" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-foreground truncate">
                                            {name || "YD Social Ops"}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {tenant?.business_name || "Nombre del negocio"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-4 text-sm">
                            <p className="font-medium flex items-center gap-2 mb-2 text-primary">
                                <Wand2 className="w-4 h-4" />
                                ¿Para qué sirve?
                            </p>
                            <ul className="text-muted-foreground space-y-1.5 list-disc pl-4 text-xs">
                                <li>Oculta el logo de YD Social Ops.</li>
                                <li>Permite re-vender el software bajo el nombre de tu propia agencia a tus empleados.</li>
                                <li>Transmite más confianza a tu equipo con un panel personalizado.</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
