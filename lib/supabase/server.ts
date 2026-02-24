import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components y Server Actions.
 * Respeta RLS usando la sesión del usuario autenticado.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // Server Component — las cookies se manejan en middleware
          }
        },
      },
    }
  );
}

/**
 * Cliente Supabase con Service Role para operaciones privilegiadas.
 * SOLO usar en rutas API y webhooks, NUNCA exponer al cliente.
 * Omite RLS — úsalo con cuidado.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Verifica autenticación via cookies y devuelve userId + tenantId + service client.
 * Útil para server actions donde RLS puede causar problemas de recursión.
 */
export async function getAuthenticatedContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createServiceClient();
  const { data: tenantUser } = await admin
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!tenantUser) return null;

  return {
    userId: user.id,
    tenantId: tenantUser.tenant_id as string,
    userRole: tenantUser.role as string,
    supabase: admin,
  };
}
