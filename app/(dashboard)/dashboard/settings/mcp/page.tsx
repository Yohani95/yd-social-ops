"use client";

import { useEffect, useState } from "react";
import { Server, Plus, Trash2, Power, Globe, KeyRound, Loader2, Link2 } from "lucide-react";
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
    listMcpServers,
    createMcpServer,
    deleteMcpServer,
    toggleMcpServer,
    type McpServer,
} from "@/actions/mcp-servers";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function McpSettingsPage() {
    const { tenant } = useDashboard();
    const [servers, setServers] = useState<McpServer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [authType, setAuthType] = useState("none");
    const [authSecret, setAuthSecret] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);

    const isEnterprise = tenant?.plan_tier === "enterprise" || tenant?.plan_tier === "enterprise_plus";

    useEffect(() => {
        if (isEnterprise) {
            loadServers();
        } else {
            setIsLoading(false);
        }
    }, [isEnterprise]);

    const loadServers = async () => {
        setIsLoading(true);
        const result = await listMcpServers();
        if (result.success && result.data) {
            setServers(result.data);
        } else {
            toast.error("Error al cargar servidores");
        }
        setIsLoading(false);
    };

    const handleCreate = async () => {
        if (!name || !url) {
            toast.error("Nombre y URL son requeridos");
            return;
        }
        setIsCreating(true);
        const result = await createMcpServer({ name, url, auth_type: authType, auth_secret: authSecret });
        if (result.success && result.data) {
            toast.success("Servidor MCP añadido");
            setServers([result.data, ...servers]);
            setDialogOpen(false);
            setName("");
            setUrl("");
            setAuthType("none");
            setAuthSecret("");
        } else {
            toast.error(result.error || "Error al añadir servidor");
        }
        setIsCreating(false);
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        const result = await toggleMcpServer(id, !currentStatus);
        if (result.success) {
            toast.success(`Servidor ${!currentStatus ? 'activado' : 'desactivado'}`);
            setServers(servers.map(s => s.id === id ? { ...s, is_active: !currentStatus } : s));
        } else {
            toast.error(result.error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Seguro que deseas eliminar esta conexión MCP?")) return;
        const result = await deleteMcpServer(id);
        if (result.success) {
            toast.success("Servidor MCP eliminado");
            setServers(servers.filter(s => s.id !== id));
        } else {
            toast.error(result.error);
        }
    };

    if (!isEnterprise) {
        return (
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Server className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Servidores MCP</h1>
                        <p className="text-muted-foreground">Conecta tu propio CRM, ERP o Bases de Datos.</p>
                    </div>
                </div>
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-primary" />
                            Función Enterprise
                        </CardTitle>
                        <CardDescription>
                            El Model Context Protocol (MCP) nativo está reservado para planes Enterprise.
                            Te permite inyectar herramientas personalizadas (ej. API internas) directamente
                            al cerebro de tu asistente de IA de forma segura.
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
                        <Server className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Servidores MCP</h1>
                        <p className="text-muted-foreground">Extiende las capacidades de tu bot con protocolos externos.</p>
                    </div>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" /> Añadir Servidor
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Conectar Servidor MCP</DialogTitle>
                            <DialogDescription>
                                Conecta una API basada en el Model Context Protocol para brindarle
                                nuevas herramientas ('tools') a tu asistente de IA.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Nombre de la integración</label>
                                <Input placeholder="Ej: Salesforce CRM Interno" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">URL del Servidor (SSE)</label>
                                <Input placeholder="https://mi-api.com/mcp/sse" value={url} onChange={e => setUrl(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Autenticación</label>
                                <select
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={authType}
                                    onChange={e => setAuthType(e.target.value)}
                                >
                                    <option value="none">Ninguna / Público</option>
                                    <option value="bearer">Bearer Token</option>
                                    <option value="api_key">X-API-Key</option>
                                    <option value="basic">Basic Auth</option>
                                </select>
                            </div>
                            {authType !== "none" && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Token / Secreto</label>
                                    <Input type="password" placeholder="Tu llave secreta" value={authSecret} onChange={e => setAuthSecret(e.target.value)} />
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleCreate} disabled={isCreating}>
                                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Guardar Conexión
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : servers.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-center border-dashed">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Link2 className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium">No hay servidores MCP</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                        El Model Context Protocol permite que tu bot lea datos de tus sistemas o
                        ejecute acciones en tu infraestructura directamente.
                    </p>
                    <Button variant="outline" className="mt-6" onClick={() => setDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Añadir la primera conexión
                    </Button>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {servers.map(server => (
                        <Card key={server.id} className={server.is_active ? "" : "opacity-60 bg-muted/30"}>
                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">{server.name}</CardTitle>
                                        {server.is_active ? (
                                            <Badge variant="success" className="text-[10px]">Activo</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[10px]">Pausado</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Globe className="w-3.5 h-3.5" />
                                        <span className="truncate max-w-[200px] sm:max-w-md">{server.url}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title={server.is_active ? "Pausar conexión" : "Activar conexión"}
                                        onClick={() => handleToggle(server.id, server.is_active)}
                                    >
                                        <Power className={`w-4 h-4 ${server.is_active ? "text-primary" : "text-muted-foreground"}`} />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        title="Eliminar servidor"
                                        onClick={() => handleDelete(server.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <KeyRound className="w-3 h-3" />
                                    <span>Autenticación: <strong className="font-medium text-foreground uppercase">{server.auth_type}</strong></span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
