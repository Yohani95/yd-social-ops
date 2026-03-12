import Link from "next/link";
import { Bot, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Bot className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-6xl font-bold text-primary mb-2">404</h1>
      <h2 className="text-xl font-semibold mb-3">Página no encontrada</h2>
      <p className="text-muted-foreground max-w-sm mb-8">
        La página que buscas no existe o fue movida. Verifica la URL o vuelve al inicio.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/">
          <Button>
            <Home className="w-4 h-4" />
            Volver al inicio
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4" />
            Ir al panel
          </Button>
        </Link>
      </div>
    </div>
  );
}
