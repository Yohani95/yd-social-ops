"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Bot, Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
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

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error("No se pudo enviar el correo. Intenta nuevamente.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
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
          {sent ? (
            <>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-2">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                </div>
                <CardTitle className="text-2xl">Revisa tu email</CardTitle>
                <CardDescription>
                  Enviamos un enlace de recuperación a{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground text-center">
                  Si no ves el correo, revisa tu carpeta de spam. El enlace
                  expira en 1 hora.
                </p>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                >
                  Enviar de nuevo
                </Button>
                <Link
                  href="/login"
                  className="text-sm text-primary hover:underline font-medium text-center"
                >
                  Volver al login
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl">
                  Recuperar contraseña
                </CardTitle>
                <CardDescription>
                  Ingresa tu email y te enviaremos un enlace para restablecer tu
                  contraseña
                </CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="tu@email.com"
                        className="pl-9"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar enlace de recuperación"
                    )}
                  </Button>

                  <p className="text-sm text-muted-foreground text-center">
                    ¿Recordaste tu contraseña?{" "}
                    <Link
                      href="/login"
                      className="text-primary hover:underline font-medium"
                    >
                      Iniciar sesión
                    </Link>
                  </p>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
