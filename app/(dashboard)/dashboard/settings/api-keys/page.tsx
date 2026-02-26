"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check, EyeOff, Globe, Loader2, Link2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import {
    listApiKeys,
    createApiKey,
    revokeApiKey,
    type ApiKey,
    type ApiKeyWithSecret
} from "@/actions/api-keys";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function ApiKeysSettingsPage() {
    const { tenant } = useDashboard();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [label, setLabel] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isEnterprise = tenant?.plan_tier === "enterprise" || tenant?.plan_tier === "enterprise_plus";

    useEffect(() => {
        if (isEnterprise) {
            loadKeys();
        } else {
            setIsLoading(false);
        }
    }, [isEnterprise]);

    const loadKeys = async () => {
        setIsLoading(true);
        const result = await listApiKeys();
        if (result.success && result.data) {
            setKeys(result.data);
        } else {
            toast.error("Error al cargar API Keys");
        }
        setIsLoading(false);
    };

    const handleCreate = async () => {
        if (!label) {
            toast.error("El nombre descriptivo es requerido");
            return;
        }
        setIsCreating(true);
        // Para simplificar, scopes fijos en esta demo
        const result = await createApiKey({ label, scopes: ["contacts:read", "messages:write"] });
        if (result.success && result.data) {
            const newKey = result.data as ApiKeyWithSecret;
            setNewSecret(newKey.secret_key); // Mostrarlo SOLO una vez

            const safeKey: ApiKey = {
                id: newKey.id,
                key_prefix: newKey.key_prefix,
                label: newKey.label,
                scopes: newKey.scopes,
                is_active: newKey.is_active,
                last_used_at: newKey.last_used_at,
                created_at: newKey.created_at
            };

            setKeys([safeKey, ...keys]);
            setLabel("");
        } else {
            toast.error(result.error || "Error al generar API Key");
        }
        setIsCreating(false);
    };

    const handleRevoke = async (id: string) => {
        if (!confirm("¿Seguro que deseas REVOCAR esta clave? Las integraciones dejarán de funcionar.")) return;
        const result = await revokeApiKey(id);
        if (result.success) {
            toast.success("API Key revocada exitosamente");
            setKeys(keys.map(k => k.id === id ? { ...k, is_active: false } : k));
        } else {
            toast.error(result.error);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Copiado al portapapeles");
    };

    const closeDialog = () => {
        setDialogOpen(false);
        setTimeout(() => setNewSecret(null), 300); // limpiar despues de cerrar
    };

    // UI para cuando no son enterprise
    if (!isEnterprise) {
        return (
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <KeyRound className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">API Pública REST</h1>
                        <p className="text-muted-foreground">Genera llaves de acceso para integrar tu sistema con herramientas de terceros.</p>
                    </div>
                </div>
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-primary" />
                            Función Enterprise
                        </CardTitle>
                        <CardDescription>
                            La API pública para desarrolladores está disponible desde el plan Enterprise.
                            Podrás acceder programáticamente a todos los Contactos, extraer Mensajes o inyectar
                            contexto a voluntad usando nuestros SDKs.
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <KeyRound className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">API Pública REST</h1>
                        <p className="text-muted-foreground">Controla el acceso programático a este Tenant con llaves de acceso seguras.</p>
                    </div>
                </div>

                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    if (!open) closeDialog();
                    else setDialogOpen(true);
                }}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" /> Crear API Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Nueva llave de acceso API</DialogTitle>
                            <DialogDescription>
                                Crea una nueva API Key para autorizar aplicaciones externas a leer y escribir
                                los contactos y conversaciones del bot.
                            </DialogDescription>
                        </DialogHeader>

                        {!newSecret ? (
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Nombre / Etiqueta de la llave</label>
                                    <Input placeholder="Ej: Zapier Integration Prod" value={label} onChange={e => setLabel(e.target.value)} />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 py-4">
                                <div className="p-4 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-600 space-y-2">
                                    <p className="font-semibold text-sm">¡Asegúrate de copiar tu API Key ahora!</p>
                                    <p className="text-xs">
                                        Por motivos de seguridad (hasheo SHA-256), no podrás volver a ver esta API Key completa después de cerrar esta ventana.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 bg-muted text-foreground text-sm rounded border truncate">
                                        {newSecret}
                                    </code>
                                    <Button variant="secondary" onClick={() => copyToClipboard(newSecret)}>
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            {!newSecret ? (
                                <>
                                    <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
                                    <Button onClick={handleCreate} disabled={isCreating}>
                                        {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Generar Key Secret
                                    </Button>
                                </>
                            ) : (
                                <Button onClick={closeDialog}>He copiado la llave de acceso</Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : keys.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-center border-dashed">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <KeyRound className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium">No hay llaves de API</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                        Utiliza la API REST de YD Social Ops para extraer y sincronizar Contactos o
                        inyectar automatizaciones. Necesitarás generar tu primera llave para empezar.
                    </p>
                    <Button variant="outline" className="mt-6" onClick={() => setDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Crear primera API Key
                    </Button>
                </Card>
            ) : (
                <div className="bg-card border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Etiqueta</th>
                                <th className="px-4 py-3 text-left font-medium">Key Prefix</th>
                                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Permisos</th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Último Uso</th>
                                <th className="px-4 py-3 text-right font-medium">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((k) => (
                                <tr key={k.id} className="border-t hover:bg-muted/50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-foreground">{k.label}</div>
                                        {!k.is_active && <Badge variant="destructive" className="mt-1 text-[10px]">Revocada</Badge>}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">
                                        {k.key_prefix}...<EyeOff className="w-3 h-3 inline ml-1 opacity-50" />
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell">
                                        <div className="flex flex-wrap gap-1">
                                            {k.scopes.map(s => <Badge variant="secondary" key={s} className="text-[10px] uppercase font-normal">{s}</Badge>)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                        {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Nunca'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive h-8 px-2 hover:text-destructive hover:bg-destructive/10"
                                            disabled={!k.is_active}
                                            onClick={() => handleRevoke(k.id)}
                                        >
                                            {k.is_active ? "Revocar" : "Revocada"}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
