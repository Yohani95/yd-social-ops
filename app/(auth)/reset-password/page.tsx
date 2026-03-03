"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, Lock, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Check if already in a recovery session (hash tokens present)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
      }
    });

    // Timeout: if no event fires within 5s, show error
    const timeout = setTimeout(() => {
      setReady((prev) => {
        if (!prev) setError(true);
        return prev;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(
        error.message.includes("same_password")
          ? "La nueva contraseña debe ser diferente a la actual"
          : "No se pudo actualizar la contraseña. Intenta nuevamente."
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    toast.success("Contraseña actualizada correctamente");
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <div className="w-full max-w-md min-w-0">
        {/* Back + Logo */}
        <div className="mb-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al login
          </Link>
          <Link href="/" className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">YD Social Ops</span>
          </Link>
        </div>

        <Card>
          {success ? (
            <>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-2">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                </div>
                <CardTitle className="text-2xl">Contraseña actualizada</CardTitle>
                <CardDescription>
                  Tu contraseña fue cambiada exitosamente. Redirigiendo al
                  login...
                </CardDescription>
              </CardHeader>
            </>
          ) : error ? (
            <>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-2">
                  <AlertCircle className="w-12 h-12 text-destructive" />
                </div>
                <CardTitle className="text-2xl">Enlace inválido</CardTitle>
                <CardDescription>
                  El enlace de recuperación expiró o es inválido. Solicita uno
                  nuevo.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex flex-col gap-4">
                <Button asChild className="w-full">
                  <Link href="/forgot-password">Solicitar nuevo enlace</Link>
                </Button>
              </CardFooter>
            </>
          ) : !ready ? (
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Verificando enlace de recuperación...
              </p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl">Nueva contraseña</CardTitle>
                <CardDescription>
                  Ingresa tu nueva contraseña. Debe tener al menos 8 caracteres.
                </CardDescription>
              </CardHeader>

              <form onSubmit={handleReset}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Nueva contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        className="pl-9"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      Confirmar contraseña
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Repite tu contraseña"
                        className="pl-9"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </CardContent>

                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Actualizando...
                      </>
                    ) : (
                      "Cambiar contraseña"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
