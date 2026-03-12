import { createServiceClient } from "@/lib/supabase/server";
import type { TeamMemberLite, UserRole } from "@/types";

function roleLabel(role: UserRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Miembro";
}

export async function listTeamMembersLite(tenantId: string): Promise<TeamMemberLite[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .select("id, user_id, role")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.warn("[TeamMembers] list tenant_users error:", error?.message);
    return [];
  }

  const members = await Promise.all(
    data.map(async (row) => {
      const role = (row.role as UserRole) || "member";
      const fallback = `${roleLabel(role)} ${String(row.id).slice(0, 6)}`;

      try {
        const { data: authData, error: authError } = await supabase.auth.admin.getUserById(row.user_id);
        if (authError || !authData?.user) {
          return {
            id: row.id,
            user_id: row.user_id,
            role,
            email: null,
            display_name: fallback,
          } satisfies TeamMemberLite;
        }

        const user = authData.user;
        const email = user.email || null;
        const fromMetadata =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "";

        return {
          id: row.id,
          user_id: row.user_id,
          role,
          email,
          display_name: (fromMetadata || email || fallback).trim(),
        } satisfies TeamMemberLite;
      } catch {
        return {
          id: row.id,
          user_id: row.user_id,
          role,
          email: null,
          display_name: fallback,
        } satisfies TeamMemberLite;
      }
    })
  );

  return members.sort((a, b) => {
    const roleRank = (role: UserRole) => (role === "owner" ? 0 : role === "admin" ? 1 : 2);
    const byRole = roleRank(a.role) - roleRank(b.role);
    if (byRole !== 0) return byRole;
    return a.display_name.localeCompare(b.display_name, "es");
  });
}
