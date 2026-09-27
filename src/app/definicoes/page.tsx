"use client";

import { useEffect, useRef, useState } from "react";
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
    setMsg(`Cópia exportada (${data.events.length} eventos, ${data.games.length} jogos).`);
  };

  const doImport = async (f: File) => {
    if (!team) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== "basketball-analytics") throw new Error("Este ficheiro não é uma cópia do Courtside.");
      const src = data.teams?.[0];
      const existing = await db.players.where("teamId").equals(team.id).count();
      const ok = await ask(
        `Importar ${src ? `“${src.name} ${src.category} ${src.season}”` : "esta cópia"} para a equipa atual (${team.name} ${team.category} · ${team.season})?\n\n` +
        `${data.players?.length ?? 0} jogadores, ${data.games?.length ?? 0} jogos e ${data.practices?.length ?? 0} treinos serão adicionados` +
        (existing ? ` aos ${existing} jogadores que já lá estão (nada é apagado).` : "."),
        { confirmText: "Importar" },
      );
      if (!ok) return;
      setMsg("A importar…");
      const { summary } = await importIntoTeam(data, team);
      setMsg(`✓ Importado para ${team.name} ${team.category}: ${summary.players} jogadores, ${summary.games} jogos, ${summary.events} eventos, ${summary.practices} treinos.${mode === "cloud" ? " A enviar para a cloud…" : ""}`);
    } catch (e) {
      setMsg(`Erro: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">Definições</h1>

      {team && (
        <section className="card grid gap-3 p-4 sm:grid-cols-4">
          <div className="flex items-center justify-between sm:col-span-4">
            <h2 className="font-semibold">Equipa atual</h2>
            <span className="text-xs text-brand">O teu papel: {ROLE_LABEL[access.role] ?? "—"}</span>
          </div>
          <div className="sm:col-span-2"><label className="label">Nome</label><input className="input" disabled={!access.canEdit} value={team.name} onChange={(e) => db.teams.update(team.id, { name: e.target.value })} /></div>
          <div><label className="label">Escalão</label><input className="input" disabled={!access.canEdit} value={team.category} onChange={(e) => db.teams.update(team.id, { category: e.target.value })} /></div>
          <div><label className="label">Época</label><input className="input" disabled={!access.canEdit} value={team.season} onChange={(e) => db.teams.update(team.id, { season: e.target.value })} /></div>
        </section>
      )}

      {team && mode === "cloud" && access.isOwner && <LocalOnlyNotice teamId={team.id} />}

      {team && mode === "cloud" && access.canEdit && <Members teamId={team.id} teamName={`${team.name} ${team.category}`} canManage={access.isOwner} myId={session?.user.id} />}

      <section className="card p-4">
        <h2 className="font-semibold">Equipas ({teams.length})</h2>
        <p className="mt-1 text-sm text-muted">Cada equipa tem o seu plantel, treinos e jogos separados. Usa o seletor no topo para trocar.</p>
        <button className="btn btn-primary mt-3" onClick={openNewTeam}>+ Nova equipa</button>
      </section>

      {access.canEdit && (
        <section className="card p-4">
          <h2 className="font-semibold">Cópia de segurança</h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "cloud"
              ? "Os dados estão guardados na cloud. Podes exportar uma cópia desta equipa em JSON quando quiseres."
              : <>Nesta versão os dados ficam guardados <b>só neste browser</b>. Exporta uma cópia depois de cada jogo e guarda-a (Drive, pen…).</>}
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" onClick={doExport}>Exportar equipa (.json)</button>
            <button className="btn" onClick={() => file.current?.click()}>Importar…</button>
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
      <h2 className="font-semibold">Esta equipa só existe neste browser</h2>
      <p className="mt-1 text-sm text-muted">Foi criada antes de entrares na conta. Envia-a para a cloud para não a perderes e poderes partilhá-la.</p>
      <button className="btn btn-primary mt-3" disabled={sent} onClick={async () => { await uploadTeam(teamId); setSent(true); }}>
        {sent ? "A enviar… vê o indicador no topo" : "Enviar para a minha conta"}
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
    if (!(await ask(`Remover ${label} da equipa?`, { confirmText: "Remover", danger: true }))) return;
    await supabase!.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    void reload();
  };
  const open = invites.filter((i) => !i.usedAt && new Date(i.expiresAt) > new Date());
  const staff = members.filter((m) => m.role !== "player");
  const linkedPlayers = members.filter((m) => m.role === "player");

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Membros</h2>
        {canManage && (
          <div className="flex gap-2">
            <button className="btn py-1 text-xs" onClick={() => setInviting("coach")}>+ Convidar treinador</button>
            <button className="btn py-1 text-xs" onClick={() => setInviting("analyst")}>+ Convidar analista</button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Equipa técnica</h3>
      <div className="mt-1 divide-y divide-line">
        {staff.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-40 flex-1">
              <div>{m.fullName || m.email} {m.userId === myId && <span className="text-xs text-muted">(tu)</span>}</div>
              <div className="text-xs text-muted">{m.email}</div>
            </div>
            {canManage && m.role !== "owner" ? (
              <>
                <select className="input w-auto py-1 text-xs" value={m.role} onChange={(e) => setRole(m.userId, e.target.value as Role)}>
                  <option value="coach">Treinador</option>
                  <option value="analyst">Analista</option>
                </select>
                <button className="btn btn-ghost py-1 text-xs text-bad" onClick={() => remove(m.userId, m.fullName || m.email)}>Remover</button>
              </>
            ) : <span className="text-xs text-brand">{ROLE_LABEL[m.role]}</span>}
          </div>
        ))}
      </div>
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Jogadores com conta ({linkedPlayers.length})</h3>
      <div className="mt-1 divide-y divide-line">
        {linkedPlayers.map((m) => {
          const p = players.find((x) => x.id === m.playerId);
          return (
            <div key={m.userId} className="flex items-center gap-2 py-2 text-sm">
              <div className="flex-1">{p ? `#${p.number} ${p.name}` : "Jogador"} <span className="text-xs text-muted">· {m.email}</span></div>
              {canManage && <button className="btn btn-ghost py-1 text-xs text-bad" onClick={() => remove(m.userId, m.email)}>Remover acesso</button>}
            </div>
          );
        })}
        {linkedPlayers.length === 0 && <p className="py-2 text-sm text-muted">Nenhum ainda. Convida jogadores no Plantel (botão &quot;Convidar&quot;).</p>}
      </div>
      {open.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Convites por usar</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {open.map((i) => {
              const p = players.find((x) => x.id === i.playerId);
              return (
                <span key={i.code} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-xs">
                  <b className="font-mono">{i.code}</b>
                  <span className="text-muted">{i.role === "player" ? (p ? `#${p.number} ${p.name.split(" ")[0]}` : "jogador") : ROLE_LABEL[i.role]}</span>
                  <button className="text-muted hover:text-bad" title="Cancelar convite" onClick={async () => { await supabase!.from("invites").delete().eq("code", i.code); void reload(); }}>✕</button>
                </span>
              );
            })}
          </div>
        </>
      )}
      {inviting && (
        <InviteDialog teamId={teamId} teamName={teamName} role={inviting} who={inviting === "coach" ? "o treinador" : "o analista"}
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
    const next = teams.find((t) => t.id !== teamId);
    if (next) setTeamId(next.id);
    router.push("/");
  };

  if (!isOwner) {
    if (mode !== "cloud" || !isMember || !myId) return null;
    return (
      <section className="card border-bad/40 p-4">
        <h2 className="font-semibold text-bad">Sair da equipa</h2>
        <p className="mt-1 text-sm text-muted">Deixas de ter acesso aos dados desta equipa. Para voltar precisas de um novo convite.</p>
        <button className="btn btn-danger mt-3" onClick={async () => {
          if (!(await ask(`Sair da equipa ${teamName}?`, { confirmText: "Sair", danger: true }))) return;
          try { await leaveTeam(teamId, myId); afterRemoval(); } catch (e) { void notify((e as Error).message); }
        }}>Sair da equipa</button>
      </section>
    );
  }

  return (
    <section className="card border-bad/40 p-4">
      <h2 className="font-semibold text-bad">Zona perigosa</h2>
      {!open ? (
        <>
          <p className="mt-1 text-sm text-muted">Eliminar a equipa apaga para sempre o plantel, treinos, presenças, jogos e estatísticas{mode === "cloud" ? ", para todos os membros" : ""}.</p>
          <button className="btn btn-danger mt-3" onClick={() => setOpen(true)}>Eliminar equipa…</button>
        </>
      ) : (
        <div className="mt-2 grid gap-3 text-sm">
          <p>
            Vais eliminar <b>{teamName}</b>
            {counts && <> com {counts.players} jogadores, {counts.practices} treinos, {counts.games} jogos e {counts.events} eventos</>}.
            Esta ação <b>não pode ser desfeita</b>. Recomendado: exporta primeiro uma cópia (.json).
          </p>
          <div>
            <label className="label">Escreve o nome da equipa para confirmar</label>
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
              {busy ? "A eliminar…" : "Eliminar para sempre"}
            </button>
            <button className="btn" onClick={() => { setOpen(false); setTyped(""); }}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
