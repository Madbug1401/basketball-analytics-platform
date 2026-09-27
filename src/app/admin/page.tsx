"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { deleteTeam } from "@/lib/teamAdmin";
import { syncNow } from "@/lib/sync";
import { Kpi } from "@/components/Kpi";
import { ask, askText } from "@/components/Dialog";
import { locale, t } from "@/lib/i18n";

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
    const [tr, u] = await Promise.all([supabase.rpc("admin_teams"), supabase.rpc("admin_users")]);
    if (tr.error || u.error) { setErr((tr.error ?? u.error)!.message); return; }
    setTeams(tr.data ?? []);
    setUsers(u.data ?? []);
  }, []);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [profile?.isAdmin, load]);

  if (mode === "local") return <p className="text-muted">{t("O painel de administração só existe na versão online.")}</p>;
  if (!profile?.isAdmin) return <p className="text-muted">{t("Sem acesso.")}</p>;

  const s = q.trim().toLowerCase();
  const fTeams = teams.filter((tm) => !s || `${tm.name} ${tm.category} ${tm.owner_email}`.toLowerCase().includes(s));
  const fUsers = users.filter((u) => !s || `${u.email} ${u.full_name} ${u.teams}`.toLowerCase().includes(s));

  const toggleAdmin = async (u: AdminUser) => {
    if (u.id === profile.id && !(await ask(t("Vais retirar-te o acesso de administrador. Continuar?"), { danger: true }))) return;
    const { error } = await supabase!.from("profiles").update({ is_admin: !u.is_admin }).eq("id", u.id);
    if (error) setErr(error.message); else void load();
  };

  const removeTeam = async (tm: AdminTeam) => {
    const typed = await askText(t("Eliminar \"{team}\" ({players} jogadores, {games} jogos) para sempre?", { team: `${tm.name} ${tm.category}`, players: tm.players, games: tm.games }) + "\n" + t("Escreve o nome da equipa para confirmar:"), { expected: tm.name, confirmText: t("Eliminar"), danger: true });
    if (typed?.trim() !== tm.name.trim()) return;
    try { await deleteTeam(tm.id); void load(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Administração")}</h1>
          <p className="text-sm text-muted">{t("Controlo total da plataforma. Só tu (e outros administradores) vês esta página.")}</p>
        </div>
        <input className="input w-full sm:w-64" placeholder={t("Pesquisar…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t("Utilizadores")} value={String(users.length)} />
        <Kpi label={t("Equipas")} value={String(teams.length)} />
        <Kpi label={t("Jogadores")} value={String(teams.reduce((a, tm) => a + tm.players, 0))} />
        <Kpi label={t("Jogos")} value={String(teams.reduce((a, tm) => a + tm.games, 0))} />
        <Kpi label={t("Eventos")} value={teams.reduce((a, tm) => a + tm.events, 0).toLocaleString(locale())} />
      </div>

      <div className="flex gap-1">
        <button className={`btn ${tab === "teams" ? "btn-primary" : ""}`} onClick={() => setTab("teams")}>{t("Equipas")}</button>
        <button className={`btn ${tab === "users" ? "btn-primary" : ""}`} onClick={() => setTab("users")}>{t("Utilizadores")}</button>
      </div>

      {tab === "teams" ? (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{t("Equipa")}</th><th>{t("Dono")}</th><th>{t("Membros")}</th><th>{t("Jogadores")}</th><th>{t("Jogos")}</th><th>{t("Eventos")}</th><th></th></tr></thead>
            <tbody>
              {fTeams.map((tm) => (
                <tr key={tm.id}>
                  <td>{tm.name} {tm.category} <span className="text-muted">· {tm.season}</span></td>
                  <td className="text-muted">{tm.owner_email ?? "—"}</td>
                  <td>{tm.members}</td><td>{tm.players}</td><td>{tm.games}</td><td>{tm.events}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn btn-ghost py-1" onClick={async () => { await syncNow(); setTeamId(tm.id); router.push("/"); }}>{t("Abrir")}</button>
                    <button className="btn btn-ghost py-1 text-bad" onClick={() => removeTeam(tm)}>{t("Eliminar")}</button>
                  </td>
                </tr>
              ))}
              {fTeams.length === 0 && <tr><td colSpan={7} className="py-6 text-center! text-muted">{t("Sem equipas.")}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{t("Utilizador")}</th><th>{t("Equipas (papel)")}</th><th>{t("Desde")}</th><th>{t("Admin")}</th></tr></thead>
            <tbody>
              {fUsers.map((u) => (
                <tr key={u.id}>
                  <td><div>{u.full_name || "—"}</div><div className="text-xs text-muted">{u.email}</div></td>
                  <td className="max-w-md text-left! text-xs text-muted">{u.teams || "—"}</td>
                  <td className="text-muted">{new Date(u.created_at).toLocaleDateString(locale())}</td>
                  <td>
                    <button className={`btn py-1 text-xs ${u.is_admin ? "border-brand text-brand" : ""}`} onClick={() => toggleAdmin(u)}>
                      {u.is_admin ? t("Admin ✓") : t("Tornar admin")}
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
