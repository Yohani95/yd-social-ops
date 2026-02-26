"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, Mail, Shield, ShieldCheck, ShieldAlert, Loader2, Crown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { toast } from "sonner";
import Link from "next/link";

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: "owner" | "admin" | "agent";
    status: "active" | "pending";
}

export default function TeamPage() {
    const { tenant, userRole } = useDashboard();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isInviting, setIsInviting] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");

    const isEnterprise = tenant?.plan_tier === "enterprise" || tenant?.plan_tier === "enterprise_plus";

    useEffect(() => {
        // Simulación de carga de miembros para el Alpha
        // En producción esto vendría de una tabla 'tenant_users' vinculada a perfiles
        setTimeout(() => {
            setMembers([
                { id: "1", name: "Usuario Owner", email: "owner@ejemplo.com", role: "owner", status: "active" },
                { id: "2", name: "Soporte Alpha", email: "agente1@ejemplo.com", role: "agent", status: "active" },
            ]);
            setIsLoading(false);
        }, 800);
    }, []);

    async function handleInvite() {
        if (!inviteEmail.trim()) return;
        setIsInviting(true);
        // Placeholder para invitación
        setTimeout(() => {
            toast.success(`Invitación enviada a ${inviteEmail}`);
            setInviteEmail("");
            setIsInviting(false);
        }, 1000);
    }

    if (!isEnterprise) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Crown className="w-8 h-8 text-primary" />
                </div>
                <div className="max-w-md">
                    <h1 className="text-2xl font-bold">Gestión de Equipo</h1>
                    <p className="text-muted-foreground mt-2">
                        La funcionalidad de múltiples usuarios y roles está disponible exclusivamente en los planes **Enterprise y Enterprise+**.
                    </p>
                </div>
                <Button asChild className="rounded-full px-8">
                    <Link href="/pricing">Ver Planes Enterprise</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6" />
                        Gestión de Equipo
                    </h1>
                    <p className="text-muted-foreground mt-1">Administra los miembros y permisos de tu negocio</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Miembros actuales</CardTitle>
                        <CardDescription>
                            {members.length} personas tienen acceso a este tenant
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="divide-y border rounded-md">
                                {members.map((member) => (
                                    <div key={member.id} className="flex items-center justify-between p-4 bg-background">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                                                <User className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{member.name}</p>
                                                <p className="text-xs text-muted-foreground">{member.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={member.role === "owner" ? "default" : member.role === "admin" ? "secondary" : "outline"}>
                                                {member.role === "owner" ? (
                                                    <ShieldCheck className="w-3 h-3 mr-1" />
                                                ) : member.role === "admin" ? (
                                                    <Shield className="w-3 h-3 mr-1" />
                                                ) : (
                                                    <ShieldAlert className="w-3 h-3 mr-1" />
                                                )}
                                                {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                                            </Badge>
                                            {member.status === "pending" && <Badge variant="warning">Pendiente</Badge>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            Invitar miembro
                        </CardTitle>
                        <CardDescription>Envía una invitación por correo electrónico</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="colaborador@ejemplo.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Rol asignado</Label>
                            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                                <option value="agent">Agente (Solo chat)</option>
                                <option value="admin">Admin (Gestión total)</option>
                            </select>
                        </div>
                        <Button className="w-full" onClick={handleInvite} disabled={isInviting || !inviteEmail}>
                            {isInviting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Enviar Invitación
                        </Button>
                        <div className="rounded-md bg-muted p-3 text-[10px] text-muted-foreground leading-relaxed">
                            <p className="font-semibold text-foreground mb-1 uppercase tracking-wider">Roles Enterprise:</p>
                            <ul className="space-y-1 list-disc pl-4">
                                <li><strong>Owner:</strong> Acceso total y gestión de facturación.</li>
                                <li><strong>Admin:</strong> Gestión de productos, bot y usuarios.</li>
                                <li><strong>Agent:</strong> Acceso limitado a chat-logs y contactos.</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function User({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
    return (
        <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {children}
        </label>
    );
}
