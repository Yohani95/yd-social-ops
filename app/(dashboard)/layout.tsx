import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardProvider } from "@/components/dashboard/dashboard-context";
import type { UserRole } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createServiceClient();

  const { data: tenantUser } = await admin
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  const tenant = tenantUser
    ? await admin
        .from("tenants")
        .select("*")
        .eq("id", tenantUser.tenant_id)
        .single()
        .then((r) => r.data)
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar tenant={tenant} userRole={tenantUser?.role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <DashboardHeader user={user} tenant={tenant} />
        <main className="flex-1 overflow-y-auto p-6">
          <DashboardProvider
            value={{
              tenant,
              tenantId: tenantUser?.tenant_id || "",
              userRole: (tenantUser?.role as UserRole) || "member",
              userId: user.id,
            }}
          >
            {children}
          </DashboardProvider>
        </main>
      </div>
    </div>
  );
}
