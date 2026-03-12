"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeamMemberLite } from "@/types";

interface MemberSelectProps {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  includeUnassigned?: boolean;
}

export function MemberSelect({
  id,
  value,
  onChange,
  disabled = false,
  includeUnassigned = true,
}: MemberSelectProps) {
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadMembers() {
      setLoading(true);
      try {
        const res = await fetch("/api/team/members-lite", { cache: "no-store" });
        const json = (await res.json()) as { data?: TeamMemberLite[] };
        if (!res.ok || cancelled) return;
        setMembers(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    if (!includeUnassigned) return members;
    return [
      {
        id: "",
        user_id: "",
        role: "member",
        email: null,
        display_name: "Sin asignar",
      } as TeamMemberLite,
      ...members,
    ];
  }, [includeUnassigned, members]);

  return (
    <select
      id={id}
      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || loading}
    >
      {loading ? <option value="">Cargando miembros...</option> : null}
      {!loading
        ? options.map((member) => (
            <option key={member.id || "unassigned"} value={member.id}>
              {member.display_name}
              {member.email ? ` · ${member.email}` : ""}
            </option>
          ))
        : null}
    </select>
  );
}
