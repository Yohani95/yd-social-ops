"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bot, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
        <Bot className="w-8 h-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Algo salió mal</h1>
      <p className="text-muted-foreground max-w-sm mb-8">
        Ocurrió un error inesperado. Puedes intentar de nuevo o volver al
        inicio.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={reset}>
          <RefreshCw className="w-4 h-4" />
          Intentar de nuevo
        </Button>
        <Link href="/">
          <Button variant="outline">
            <Home className="w-4 h-4" />
            Volver al inicio
          </Button>
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground/50 mt-6">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  );
}
