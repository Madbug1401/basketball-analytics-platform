"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { deleteTeam } from "@/lib/teamAdmin";
import { syncNow } from "@/lib/sync";
import { Kpi } from "@/components/Kpi";

interface AdminTeam { id: string; name: string; category: string; season: string; owner_email: string | null; members: number; players: number; games: number; events: number; created_at: number }
interface AdminUser { id: string; email: string; full_name: string; is_admin: boolean; created_at: string; teams: string }

export default function AdminPage() {
  const { profile, mode } = useAuth();
  const { setTeamId } = useTeam();
  const router = useRouter();
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<"teams" | "users">("teams");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [t, u] = await Promise.all([supabase.rpc("admin_teams"), supabase.rpc("admin_users")]);
    if (t.error || u.error) { setErr((t.error ?? u.error)!.message); return; }
    setTeams(t.data ?? []);
    setUsers(u.data ?? []);
  }, []);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [profile?.isAdmin, load]);

  if (mode === "local") return <p className="text-muted">O painel de administração só existe na versão online.</p>;
  if (!profile?.isAdmin) return <p className="text-muted">Sem acesso.</p>;

  const s = q.trim().toLowerCase();
  const fTeams = teams.filter((t) => !s || `${t.name} ${t.category} ${t.owner_email}`.toLowerCase().includes(s));
  const fUsers = users.filter((u) => !s || `${u.email} ${u.full_name} ${u.teams}`.toLowerCase().includes(s));

  const toggleAdmin = async (u: AdminUser) => {
    if (u.id === profile.id && !confirm("Vais retirar-te o acesso de administrador. Continuar?")) return;
    const { error } = await supabase!.from("profiles").update({ is_admin: !u.is_admin }).eq("id", u.id);
    if (error) setErr(error.message); else void load();
  };

  const removeTeam = async (t: AdminTeam) => {
    const typed = prompt(`Eliminar "${t.name} ${t.category}" (${t.players} jogadores, ${t.games} jogos) para sempre?\nEscreve o nome da equipa para confirmar:`);
    if (typed?.trim() !== t.name.trim()) return;
    try { await deleteTeam(t.id); void load(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Administração</h1>
          <p className="text-sm text-muted">Controlo total da plataforma. Só tu (e outros administradores) vês esta página.</p>
        </div>
        <input className="input w-64" placeholder="Pesquisar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Utilizadores" value={String(users.length)} />
        <Kpi label="Equipas" value={String(teams.length)} />
        <Kpi label="Jogadores" value={String(teams.reduce((a, t) => a + t.players, 0))} />
        <Kpi label="Jogos" value={String(teams.reduce((a, t) => a + t.games, 0))} />
        <Kpi label="Eventos" value={teams.reduce((a, t) => a + t.events, 0).toLocaleString("pt-PT")} />
      </div>

      <div className="flex gap-1">
        <button className={`btn ${tab === "teams" ? "btn-primary" : ""}`} onClick={() => setTab("teams")}>Equipas</button>
        <button className={`btn ${tab === "users" ? "btn-primary" : ""}`} onClick={() => setTab("users")}>Utilizadores</button>
      </div>

      {tab === "teams" ? (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Equipa</th><th>Dono</th><th>Membros</th><th>Jogadores</th><th>Jogos</th><th>Eventos</th><th></th></tr></thead>
            <tbody>
              {fTeams.map((t) => (
                <tr key={t.id}>
                  <td>{t.name} {t.category} <span className="text-muted">· {t.season}</span></td>
                  <td className="text-muted">{t.owner_email ?? "—"}</td>
                  <td>{t.members}</td><td>{t.players}</td><td>{t.games}</td><td>{t.events}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn btn-ghost py-1" onClick={async () => { await syncNow(); setTeamId(t.id); router.push("/"); }}>Abrir</button>
                    <button className="btn btn-ghost py-1 text-bad" onClick={() => removeTeam(t)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {fTeams.length === 0 && <tr><td colSpan={7} className="py-6 text-center! text-muted">Sem equipas.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Utilizador</th><th>Equipas (papel)</th><th>Desde</th><th>Admin</th></tr></thead>
            <tbody>
              {fUsers.map((u) => (
                <tr key={u.id}>
                  <td><div>{u.full_name || "—"}</div><div className="text-xs text-muted">{u.email}</div></td>
                  <td className="max-w-md text-left! text-xs text-muted">{u.teams || "—"}</td>
                  <td className="text-muted">{new Date(u.created_at).toLocaleDateString("pt-PT")}</td>
                  <td>
                    <button className={`btn py-1 text-xs ${u.is_admin ? "border-brand text-brand" : ""}`} onClick={() => toggleAdmin(u)}>
                      {u.is_admin ? "Admin ✓" : "Tornar admin"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
