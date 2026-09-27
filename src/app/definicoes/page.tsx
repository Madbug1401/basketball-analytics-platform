"use client";

import { useEffect, useRef, useState } from "react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useRouter } from "next/navigation";
import { db, exportAll, importIntoTeam } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { ROLE_LABEL, useAccess, useAuth, type Role } from "@/lib/auth";
import { useTeamMembers } from "@/lib/members";
import { deleteTeam, leaveTeam, teamCounts } from "@/lib/teamAdmin";
import { seenTeamIds, uploadTeam } from "@/lib/sync";
import { supabase } from "@/lib/supabase";
import { openNewTeam } from "@/components/Shell";
import { InviteDialog } from "@/components/InviteDialog";
import { ask, notify } from "@/components/Dialog";
import { t } from "@/lib/i18n";

export default function SettingsPage() {
  const { team, teams } = useTeam();
  const { mode, session } = useAuth();
  const access = useAccess(team?.id);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportAll(team?.id);
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `courtside-${(team?.name ?? "backup").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(t("Cópia exportada ({events} eventos, {games} jogos).", { events: data.events.length, games: data.games.length }));
  };

  const doImport = async (f: File) => {
    if (!team) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== "basketball-analytics") throw new Error(t("Este ficheiro não é uma cópia do Courtside."));
      const src = data.teams?.[0];
      const existing = await db.players.where("teamId").equals(team.id).count();
      const target = `${team.name} ${team.category} · ${team.season}`;
      const counts = { players: data.players?.length ?? 0, games: data.games?.length ?? 0, practices: data.practices?.length ?? 0 };
      const ok = await ask(
        (src
          ? t("Importar “{src}” para a equipa atual ({team})?", { src: `${src.name} ${src.category} ${src.season}`, team: target })
          : t("Importar esta cópia para a equipa atual ({team})?", { team: target })) + "\n\n" +
        (existing
          ? t("{players} jogadores, {games} jogos e {practices} treinos serão adicionados aos {existing} jogadores que já lá estão (nada é apagado).", { ...counts, existing })
          : t("{players} jogadores, {games} jogos e {practices} treinos serão adicionados.", counts)),
        { confirmText: t("Importar") },
      );
      if (!ok) return;
      setMsg(t("A importar…"));
      const { summary } = await importIntoTeam(data, team);
      setMsg(t("✓ Importado para {team}: {players} jogadores, {games} jogos, {events} eventos, {practices} treinos.", { team: `${team.name} ${team.category}`, players: summary.players, games: summary.games, events: summary.events, practices: summary.practices }) + (mode === "cloud" ? " " + t("A enviar para a cloud…") : ""));
    } catch (e) {
      setMsg(t("Erro: {msg}", { msg: (e as Error).message }));
    }
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">{t("Definições")}</h1>

      {team && (
        <section className="card grid gap-3 p-4 sm:grid-cols-4">
          <div className="flex items-center justify-between sm:col-span-4">
            <h2 className="font-semibold">{t("Equipa atual")}</h2>
            <span className="text-xs text-brand">{t("O teu papel: {role}", { role: ROLE_LABEL[access.role] ? t(ROLE_LABEL[access.role]) : "—" })}</span>
          </div>
          <div className="sm:col-span-2"><label className="label">{t("Nome")}</label><input className="input" disabled={!access.canEdit} value={team.name} onChange={(e) => db.teams.update(team.id, { name: e.target.value })} /></div>
          <div><label className="label">{t("Escalão")}</label><input className="input" disabled={!access.canEdit} value={team.category} onChange={(e) => db.teams.update(team.id, { category: e.target.value })} /></div>
          <div><label className="label">{t("Época")}</label><input className="input" disabled={!access.canEdit} value={team.season} onChange={(e) => db.teams.update(team.id, { season: e.target.value })} /></div>
        </section>
      )}

      <LanguagePicker />

      {team && mode === "cloud" && access.isOwner && <LocalOnlyNotice teamId={team.id} />}

      {team && mode === "cloud" && access.canEdit && <Members teamId={team.id} teamName={`${team.name} ${team.category}`} canManage={access.isOwner} myId={session?.user.id} />}

      <section className="card p-4">
        <h2 className="font-semibold">{t("Equipas ({n})", { n: teams.length })}</h2>
        <p className="mt-1 text-sm text-muted">{t("Cada equipa tem o seu plantel, treinos e jogos separados. Usa o seletor no topo para trocar.")}</p>
        <button className="btn btn-primary mt-3" onClick={openNewTeam}>{t("+ Nova equipa")}</button>
      </section>

      {access.canEdit && (
        <section className="card p-4">
          <h2 className="font-semibold">{t("Cópia de segurança")}</h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "cloud"
              ? t("Os dados estão guardados na cloud. Podes exportar uma cópia desta equipa em JSON quando quiseres.")
              : <>{t("Nesta versão os dados ficam guardados")} <b>{t("só neste browser")}</b>. {t("Exporta uma cópia depois de cada jogo e guarda-a (Drive, pen…).")}</>}
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" onClick={doExport}>{t("Exportar equipa (.json)")}</button>
            <button className="btn" onClick={() => file.current?.click()}>{t("Importar…")}</button>
            <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doImport(f); }} />
          </div>
          {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
        </section>
      )}

      {team && <DangerZone key={team.id} teamId={team.id} teamName={team.name} isOwner={access.isOwner} isMember={access.role !== "none" && access.role !== "admin"} myId={session?.user.id} />}
    </div>
  );
}

function LocalOnlyNotice({ teamId }: { teamId: string }) {
  const [localOnly, setLocalOnly] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([seenTeamIds(), db.outbox.where("teamId").equals(teamId).count()]).then(([seen, pending]) => {
      if (alive) setLocalOnly(!seen.has(teamId) && pending === 0);
    });
    return () => { alive = false; };
  }, [teamId]);
  if (!localOnly) return null;
  return (
    <section className="card border-brand p-4">
      <h2 className="font-semibold">{t("Esta equipa só existe neste browser")}</h2>
      <p className="mt-1 text-sm text-muted">{t("Foi criada antes de entrares na conta. Envia-a para a cloud para não a perderes e poderes partilhá-la.")}</p>
      <button className="btn btn-primary mt-3" disabled={sent} onClick={async () => { await uploadTeam(teamId); setSent(true); }}>
        {sent ? t("A enviar… vê o indicador no topo") : t("Enviar para a minha conta")}
      </button>
    </section>
  );
}

function Members({ teamId, teamName, canManage, myId }: { teamId: string; teamName: string; canManage: boolean; myId?: string }) {
  const { members, invites, reload, error } = useTeamMembers(teamId, true);
  const players = useTeamPlayers(teamId);
  const [inviting, setInviting] = useState<"coach" | "analyst" | null>(null);
  const setRole = async (userId: string, role: Role) => {
    await supabase!.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", userId);
    void reload();
  };
  const remove = async (userId: string, label: string) => {
    if (!(await ask(t("Remover {name} da equipa?", { name: label }), { confirmText: t("Remover"), danger: true }))) return;
    await supabase!.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    void reload();
  };
  const open = invites.filter((i) => !i.usedAt && new Date(i.expiresAt) > new Date());
  const staff = members.filter((m) => m.role !== "player");
  const linkedPlayers = members.filter((m) => m.role === "player");

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("Membros")}</h2>
        {canManage && (
          <div className="flex gap-2">
            <button className="btn py-1 text-xs" onClick={() => setInviting("coach")}>{t("+ Convidar treinador")}</button>
            <button className="btn py-1 text-xs" onClick={() => setInviting("analyst")}>{t("+ Convidar analista")}</button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{t("Equipa técnica")}</h3>
      <div className="mt-1 divide-y divide-line">
        {staff.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-40 flex-1">
              <div>{m.fullName || m.email} {m.userId === myId && <span className="text-xs text-muted">{t("(tu)")}</span>}</div>
              <div className="text-xs text-muted">{m.email}</div>
            </div>
            {canManage && m.role !== "owner" ? (
              <>
                <select className="input w-auto py-1 text-xs" value={m.role} onChange={(e) => setRole(m.userId, e.target.value as Role)}>
                  <option value="coach">{t("Treinador")}</option>
                  <option value="analyst">{t("Analista")}</option>
                </select>
                <button className="btn btn-ghost py-1 text-xs text-bad" onClick={() => remove(m.userId, m.fullName || m.email)}>{t("Remover")}</button>
              </>
            ) : <span className="text-xs text-brand">{t(ROLE_LABEL[m.role])}</span>}
          </div>
        ))}
      </div>
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{t("Jogadores com conta ({n})", { n: linkedPlayers.length })}</h3>
      <div className="mt-1 divide-y divide-line">
        {linkedPlayers.map((m) => {
          const p = players.find((x) => x.id === m.playerId);
          return (
            <div key={m.userId} className="flex items-center gap-2 py-2 text-sm">
              <div className="flex-1">{p ? `#${p.number} ${p.name}` : t("Jogador")} <span className="text-xs text-muted">· {m.email}</span></div>
              {canManage && <button className="btn btn-ghost py-1 text-xs text-bad" onClick={() => remove(m.userId, m.email)}>{t("Remover acesso")}</button>}
            </div>
          );
        })}
        {linkedPlayers.length === 0 && <p className="py-2 text-sm text-muted">{t("Nenhum ainda. Convida jogadores no Plantel (botão \"Convidar\").")}</p>}
      </div>
      {open.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{t("Convites por usar")}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {open.map((i) => {
              const p = players.find((x) => x.id === i.playerId);
              return (
                <span key={i.code} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-xs">
                  <b className="font-mono">{i.code}</b>
                  <span className="text-muted">{i.role === "player" ? (p ? `#${p.number} ${p.name.split(" ")[0]}` : t("jogador")) : t(ROLE_LABEL[i.role])}</span>
                  <button className="text-muted hover:text-bad" title={t("Cancelar convite")} onClick={async () => { await supabase!.from("invites").delete().eq("code", i.code); void reload(); }}>✕</button>
                </span>
              );
            })}
          </div>
        </>
      )}
      {inviting && (
        <InviteDialog teamId={teamId} teamName={teamName} role={inviting} who={inviting === "coach" ? t("o treinador") : t("o analista")}
          onClose={() => { setInviting(null); void reload(); }} />
      )}
    </section>
  );
}

function useTeamPlayers(teamId: string) {
  const [players, setPlayers] = useState<{ id: string; name: string; number: number }[]>([]);
  useEffect(() => {
    let alive = true;
    db.players.where("teamId").equals(teamId).toArray().then((p) => alive && setPlayers(p));
    return () => { alive = false; };
  }, [teamId]);
  return players;
}

function DangerZone({ teamId, teamName, isOwner, isMember, myId }: { teamId: string; teamName: string; isOwner: boolean; isMember: boolean; myId?: string }) {
  const router = useRouter();
  const { mode } = useAuth();
  const { teams, setTeamId } = useTeam();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof teamCounts>> | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    teamCounts(teamId).then((c) => alive && setCounts(c));
    return () => { alive = false; };
  }, [open, teamId]);

  const afterRemoval = () => {
    const next = teams.find((tm) => tm.id !== teamId);
    if (next) setTeamId(next.id);
    router.push("/");
  };

  if (!isOwner) {
    if (mode !== "cloud" || !isMember || !myId) return null;
    return (
      <section className="card border-bad/40 p-4">
        <h2 className="font-semibold text-bad">{t("Sair da equipa")}</h2>
        <p className="mt-1 text-sm text-muted">{t("Deixas de ter acesso aos dados desta equipa. Para voltar precisas de um novo convite.")}</p>
        <button className="btn btn-danger mt-3" onClick={async () => {
          if (!(await ask(t("Sair da equipa {team}?", { team: teamName }), { confirmText: t("Sair"), danger: true }))) return;
          try { await leaveTeam(teamId, myId); afterRemoval(); } catch (e) { void notify((e as Error).message); }
        }}>{t("Sair da equipa")}</button>
      </section>
    );
  }

  return (
    <section className="card border-bad/40 p-4">
      <h2 className="font-semibold text-bad">{t("Zona perigosa")}</h2>
      {!open ? (
        <>
          <p className="mt-1 text-sm text-muted">{mode === "cloud" ? t("Eliminar a equipa apaga para sempre o plantel, treinos, presenças, jogos e estatísticas, para todos os membros.") : t("Eliminar a equipa apaga para sempre o plantel, treinos, presenças, jogos e estatísticas.")}</p>
          <button className="btn btn-danger mt-3" onClick={() => setOpen(true)}>{t("Eliminar equipa…")}</button>
        </>
      ) : (
        <div className="mt-2 grid gap-3 text-sm">
          <p>
            {t("Vais eliminar")} <b>{teamName}</b>
            {counts && <> {t("com {players} jogadores, {practices} treinos, {games} jogos e {events} eventos", { players: counts.players, practices: counts.practices, games: counts.games, events: counts.events })}</>}.{" "}
            <b>{t("Esta ação não pode ser desfeita.")}</b> {t("Recomendado: exporta primeiro uma cópia (.json).")}
          </p>
          <div>
            <label className="label">{t("Escreve o nome da equipa para confirmar")}</label>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={teamName} autoFocus />
          </div>
          {err && <p className="text-bad">{err}</p>}
          <div className="flex gap-2">
            <button className="btn border-bad bg-bad text-black hover:bg-bad/80" disabled={busy || typed.trim() !== teamName.trim()}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try { await deleteTeam(teamId); afterRemoval(); } catch (e) { setErr((e as Error).message); setBusy(false); }
              }}>
              {busy ? t("A eliminar…") : t("Eliminar para sempre")}
            </button>
            <button className="btn" onClick={() => { setOpen(false); setTyped(""); }}>{t("Cancelar")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
