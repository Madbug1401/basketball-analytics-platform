"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Role } from "./auth";

export interface Member { userId: string; role: Role; playerId?: string; email: string; fullName: string }
export interface Invite { code: string; role: string; playerId?: string; createdAt: string; expiresAt: string; usedAt?: string }

/** Members and open invites of a team (online only). */
export function useTeamMembers(teamId?: string, withInvites = false) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !teamId) return;
    const { data: m, error: e1 } = await supabase.from("team_members").select("user_id, role, player_id").eq("team_id", teamId);
    if (e1) { setError(e1.message); return; }
    const ids = (m ?? []).map((r) => r.user_id);
    const { data: p } = ids.length ? await supabase.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
    const prof = new Map((p ?? []).map((r) => [r.id, r]));
    setMembers((m ?? []).map((r) => ({
      userId: r.user_id, role: r.role as Role, playerId: r.player_id ?? undefined,
      email: prof.get(r.user_id)?.email ?? "", fullName: prof.get(r.user_id)?.full_name ?? "",
    })));
    if (withInvites) {
      const { data: inv } = await supabase.from("invites").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
      setInvites((inv ?? []).map((r) => ({ code: r.code, role: r.role, playerId: r.player_id ?? undefined, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at ?? undefined })));
    }
    setError(null);
  }, [teamId, withInvites]);

  useEffect(() => {
    let alive = true;
    // defer so the effect body itself doesn't set state synchronously
    const t = setTimeout(() => { if (alive) void load(); }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [load]);

  return { members, invites, error, reload: load };
}

export async function createInvite(teamId: string, role: "player" | "coach" | "analyst", playerId?: string) {
  if (!supabase) throw new Error("Sem ligação ao servidor");
  const { data, error } = await supabase.rpc("create_invite", { p_team: teamId, p_role: role, p_player: playerId ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

export const inviteLink = (code: string) => (typeof window === "undefined" ? "" : `${window.location.origin}/convite?c=${code}`);
