"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot, Mail, Lock, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleIcon } from "@/components/auth/google-icon";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function sanitizeNextPath(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<"google" | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "Email o contraseña incorrectos"
        : error.message);
      setLoading(false);
      return;
    }

    toast.success("¡Bienvenido de vuelta!");
    router.push(nextPath);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setOauthLoadingProvider("google");

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      const isDisabledProvider = error?.message.toLowerCase().includes("provider is not enabled");
      toast.error(
        isDisabledProvider
          ? "Google no esta habilitado en Supabase. Activalo en Authentication > Providers."
          : "No se pudo iniciar con Google"
      );
      setOauthLoadingProvider(null);
      return;
    }

    window.location.assign(data.url);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <div className="w-full max-w-md min-w-0">
        {/* Back + Logo */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>
          <Link href="/" className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">YD Social Ops</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
            <CardDescription>
              Ingresa tus credenciales para acceder al panel
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading || Boolean(oauthLoadingProvider)}
                onClick={handleGoogleLogin}
              >
                {oauthLoadingProvider === "google" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Redirigiendo...
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Continuar con Google
                  </>
                )}
              </Button>

              {/* Inicio con Facebook temporalmente desactivado. */}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">o con email</span>
                </div>
              </div>

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

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div className="text-right">
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading || Boolean(oauthLoadingProvider)}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  "Iniciar sesión"
                )}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                ¿No tienes cuenta?{" "}
                <Link
                  href={`/register?next=${encodeURIComponent(nextPath)}`}
                  className="text-primary hover:underline font-medium"
                >
                  Regístrate gratis
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
