"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE_CONSENT_KEY = "yd_cookie_consent";

export function CookieBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!consent) {
            // Mostrar después de un breve delay para no interrumpir la carga
            const timer = setTimeout(() => setVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    function accept() {
        localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
        setVisible(false);
    }

    function decline() {
        localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[99998] p-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-4xl mx-auto rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Utilizamos cookies y almacenamiento local para mantener tu sesión,
                            recordar preferencias y mejorar tu experiencia.{" "}
                            <Link
                                href="/privacy"
                                className="text-primary hover:underline font-medium"
                            >
                                Política de privacidad
                            </Link>
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={decline}>
                            Rechazar
                        </Button>
                        <Button size="sm" onClick={accept}>
                            Aceptar
                        </Button>
                        <button
                            onClick={decline}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                            aria-label="Cerrar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
