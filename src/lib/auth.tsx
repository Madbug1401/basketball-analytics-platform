"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudConfigured, supabase } from "./supabase";
import { clearAllLocal } from "./db";
import { startSync, stopSync, syncNow, syncStore } from "./sync";

export type Role = "owner" | "coach" | "analyst" | "player";
export interface Membership { teamId: string; role: Role; playerId?: string }
export interface Profile { id: string; email: string; fullName: string; isAdmin: boolean }

interface AuthCtx {
  mode: "local" | "cloud";
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  claimInvite: (code: string) => Promise<string>;
  markOwned: (teamId: string) => void;
}

const Ctx = createContext<AuthCtx>({
  mode: "local", ready: true, session: null, profile: null, memberships: [],
  refresh: async () => {}, signOut: async () => {}, claimInvite: async () => "", markOwned: () => {},
});

export const PENDING_INVITE_KEY = "bap.pendingInvite";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!cloudConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) { setProfile(null); setMemberships([]); return; }
    const uid = s.user.id;
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("team_members").select("team_id, role, player_id").eq("user_id", uid),
    ]);
    setProfile(p ? { id: p.id, email: p.email ?? s.user.email ?? "", fullName: p.full_name ?? "", isAdmin: !!p.is_admin } : { id: uid, email: s.user.email ?? "", fullName: "", isAdmin: false });
    setMemberships((m ?? []).map((r) => ({ teamId: r.team_id, role: r.role as Role, playerId: r.player_id ?? undefined })));
  }, []);

  const claimInvite = useCallback(async (code: string) => {
    if (!supabase) throw new Error("Sem ligação ao servidor");
    const { data, error } = await supabase.rpc("claim_invite", { p_code: code.trim() });
    if (error) throw new Error(error.message);
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch {}
    const { data: s } = await supabase.auth.getSession();
    await load(s.session);
    await syncNow();
    return data as string;
  }, [load]);

  // memberships change when teams are created (server trigger) or invites are claimed
  useEffect(() => {
    if (!supabase) return;
    let last = syncStore.get().lastSync;
    return syncStore.subscribe(() => {
      const ls = syncStore.get().lastSync;
      if (ls && ls !== last) {
        last = ls;
        supabase!.auth.getSession().then(({ data }) => {
          if (!data.session) return;
          supabase!.from("team_members").select("team_id, role, player_id").eq("user_id", data.session.user.id).then(({ data: m }) => {
            if (m) setMemberships((prev) => {
              const next: Membership[] = m.map((r) => ({ teamId: r.team_id, role: r.role as Role, playerId: r.player_id ?? undefined }));
              // keep optimistic ownership of teams not yet uploaded
              prev.forEach((p) => { if (p.role === "owner" && !next.some((n) => n.teamId === p.teamId)) next.push(p); });
              return next;
            });
          });
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let current: string | null = null;
    const handle = async (s: Session | null) => {
      setSession(s);
      const uid = s?.user.id ?? null;
      if (uid && uid !== current) {
        current = uid;
        await load(s);
        setReady(true);
        let pending: string | null = null;
        try { pending = localStorage.getItem(PENDING_INVITE_KEY); } catch {}
        if (pending) { try { await claimInvite(pending); } catch { /* shown on the invite page */ } }
        await startSync(supabase!, uid);
      } else if (!uid) {
        if (current) { stopSync(); await clearAllLocal(); }
        current = null;
        await load(null);
        setReady(true);
      }
    };
    supabase.auth.getSession().then(({ data }) => handle(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void handle(s); });
    return () => sub.subscription.unsubscribe();
  }, [load, claimInvite]);

  const value: AuthCtx = {
    mode: cloudConfigured ? "cloud" : "local",
    ready,
    session,
    profile,
    memberships,
    refresh: async () => { if (supabase) { const { data } = await supabase.auth.getSession(); await load(data.session); } },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
    claimInvite,
    markOwned: (teamId) => setMemberships((prev) => (prev.some((p) => p.teamId === teamId) ? prev : [...prev, { teamId, role: "owner" }])),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export interface Access {
  role: Role | "admin" | "none";
  canEdit: boolean; // staff: owner, coach, analyst (and admin / local mode)
  isOwner: boolean; // owner or admin (or local mode)
  isAdmin: boolean;
  isPlayer: boolean;
  playerId?: string;
}

export function useAccess(teamId?: string): Access {
  const { mode, profile, memberships } = useAuth();
  if (mode === "local") return { role: "owner", canEdit: true, isOwner: true, isAdmin: false, isPlayer: false };
  const m = memberships.find((x) => x.teamId === teamId);
  const isAdmin = !!profile?.isAdmin;
  if (!m) {
    return isAdmin
      ? { role: "admin", canEdit: true, isOwner: true, isAdmin, isPlayer: false }
      : { role: "none", canEdit: false, isOwner: false, isAdmin, isPlayer: false };
  }
  const staff = m.role !== "player";
  return {
    role: m.role,
    canEdit: staff || isAdmin,
    isOwner: m.role === "owner" || isAdmin,
    isAdmin,
    isPlayer: m.role === "player",
    playerId: m.playerId,
  };
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Dono / treinador principal",
  coach: "Treinador",
  analyst: "Analista",
  player: "Jogador",
  admin: "Administrador",
};
