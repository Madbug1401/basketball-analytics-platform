"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, today, uid } from "@/lib/db";
import { movePlayer, teamLabel } from "@/lib/physical";
import { useTeam } from "@/lib/team";
import { useAccess, useAuth } from "@/lib/auth";
import { useTeamMembers } from "@/lib/members";
import { InviteDialog } from "@/components/InviteDialog";
import { POSITIONS, type Player, type Position, type Team } from "@/lib/types";
import { t } from "@/lib/i18n";

type Draft = { name: string; number: string; position: Position; birthYear: string; heightCm: string; notes: string };
const blank: Draft = { name: "", number: "", position: "", birthYear: "", heightCm: "", notes: "" };

export default function RosterPage() {
  const { team, teams, setTeamId } = useTeam();
  const access = useAccess(team?.id);
  const { mode } = useAuth();
  const { members, reload } = useTeamMembers(mode === "cloud" && access.canEdit ? team?.id : undefined);
  const [inviting, setInviting] = useState<Player | null>(null);
  const players = useLiveQuery(
    () => (team ? db.players.where("teamId").equals(team.id).sortBy("number") : []),
    [team?.id],
  );
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [moving, setMoving] = useState<Player | null>(null);
  const { memberships, profile } = useAuth();
  // teams this user can add players to (staff there)
  const otherTeams = teams.filter((tm) => tm.id !== team?.id && (mode === "local" || profile?.isAdmin || memberships.some((m) => m.teamId === tm.id && m.role !== "player")));

  if (!team || !players) return null;

  const taken = players.some((p) => p.active && String(p.number) === draft.number && p.id !== editing);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: draft.name.trim(),
      number: Number(draft.number),
      position: draft.position,
      birthYear: draft.birthYear ? Number(draft.birthYear) : undefined,
      heightCm: draft.heightCm ? Number(draft.heightCm) : undefined,
      notes: draft.notes || undefined,
    };
    let pid = editing;
    const before = editing ? players.find((p) => p.id === editing)?.heightCm : undefined;
    if (editing) await db.players.update(editing, data);
    else { pid = uid(); await db.players.add({ id: pid, teamId: team.id, active: true, createdAt: Date.now(), ...data }); }
    // a new height is kept as a dated measurement (history for the physical profile)
    if (pid && data.heightCm && data.heightCm !== before) {
      await db.measurements.add({ id: uid(), teamId: team.id, playerId: pid, type: "altura", value: data.heightCm, date: today(), notes: "editado no plantel", createdAt: Date.now() });
    }
    setDraft(blank);
    setEditing(null);
  };

  const edit = (p: Player) => {
    setEditing(p.id);
    setDraft({
      name: p.name, number: String(p.number), position: p.position,
      birthYear: p.birthYear ? String(p.birthYear) : "", heightCm: p.heightCm ? String(p.heightCm) : "", notes: p.notes ?? "",
    });
  };

  const list = players.filter((p) => showInactive || p.active);

  return (
    <div className={`grid gap-6 ${access.canEdit ? "lg:grid-cols-[1fr_340px]" : ""}`}>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t("Plantel")}</h1>
            <p className="text-sm text-muted">{t("{n} jogadores ativos", { n: players.filter((p) => p.active).length })}</p>
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t("Mostrar inativos")}
          </label>
        </div>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Jogador")}</th><th>{t("Pos")}</th><th>{t("Ano")}</th><th>{t("Altura")}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td>
                    <Link href={`/jogadores/${p.id}`} className="flex items-center gap-3 hover:text-brand">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 font-mono text-sm font-semibold">{p.number}</span>
                      {p.name}
                    </Link>
                  </td>
                  <td>{p.position || "–"}</td>
                  <td>{p.birthYear ?? "–"}</td>
                  <td>{p.heightCm ? `${p.heightCm} cm` : "–"}</td>
                  <td className="whitespace-nowrap">
                    {access.canEdit && mode === "cloud" && (() => {
                      const linked = members.find((m) => m.playerId === p.id);
                      return linked
                        ? <span className="mr-2 text-xs text-good" title={linked.email}>{t("✓ conta ligada")}</span>
                        : <button className="btn btn-ghost py-1 text-brand" onClick={() => setInviting(p)}>{t("Convidar")}</button>;
                    })()}
                    {access.canEdit && (
                      <>
                        <button className="btn btn-ghost py-1" onClick={() => edit(p)}>{t("Editar")}</button>
                        <button className="btn btn-ghost py-1" onClick={() => db.players.update(p.id, { active: !p.active })}>
                          {p.active ? t("Desativar") : t("Ativar")}
                        </button>
                        {otherTeams.length > 0 && <button className="btn btn-ghost py-1" onClick={() => setMoving(p)}>{t("Subir de escalão")}</button>}
                      </>
                    )}
                    {access.isPlayer && access.playerId === p.id && <span className="text-xs text-brand">{t("és tu")}</span>}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center! text-muted">{t("Ainda sem jogadores. Adiciona o primeiro →")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {access.canEdit && <form onSubmit={save} className="card grid h-fit gap-3 p-4">
        <h2 className="font-semibold">{editing ? t("Editar jogador") : t("Adicionar jogador")}</h2>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <div>
            <label className="label">{t("Nº")}</label>
            <input className="input" required inputMode="numeric" pattern="\d{1,2}" value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Nome")}</label>
            <input className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
        </div>
        {taken && <p className="text-xs text-bad">{t("Já existe um jogador ativo com o nº {n}.", { n: draft.number })}</p>}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t("Posição")}</label>
            <select className="input" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value as Position })}>
              <option value="">–</option>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t("Ano nasc.")}</label>
            <input className="input" inputMode="numeric" value={draft.birthYear} onChange={(e) => setDraft({ ...draft, birthYear: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Altura")}</label>
            <input className="input" inputMode="numeric" placeholder="cm" value={draft.heightCm} onChange={(e) => setDraft({ ...draft, heightCm: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">{t("Notas")}</label>
          <textarea className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" disabled={taken}>{editing ? t("Guardar") : t("Adicionar")}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setDraft(blank); }}>{t("Cancelar")}</button>}
        </div>
        <p className="text-xs text-muted">{t("Só guardamos o ano de nascimento (não a data completa) — menos dados pessoais de menores.")}</p>
      </form>}
      {inviting && team && (
        <InviteDialog teamId={team.id} teamName={`${team.name} ${team.category}`} role="player" playerId={inviting.id}
          who={inviting.name.split(" ")[0]} onClose={() => { setInviting(null); void reload(); }} />
      )}
      {moving && team && <MoveDialog player={moving} from={team} teams={otherTeams} onClose={() => setMoving(null)} onOpen={(id) => setTeamId(id)} />}
    </div>
  );
}

/** Move a player to another team (e.g. Sub-16 → Sub-18): the physical history goes with them. */
function MoveDialog({ player, from, teams, onClose, onOpen }: { player: Player; from: Team; teams: Team[]; onClose: () => void; onOpen: (teamId: string) => void }) {
  const [to, setTo] = useState(teams[0]?.id ?? "");
  const [number, setNumber] = useState(String(player.number));
  const [deactivate, setDeactivate] = useState(true);
  const [done, setDone] = useState<{ copied: number; team: Team } | null>(null);
  const target = teams.find((tm) => tm.id === to);
  const clash = useLiveQuery(async () => (to ? (await db.players.where("teamId").equals(to).filter((p) => p.active && String(p.number) === number).count()) > 0 : false), [to, number]);
  const already = useLiveQuery(async () => (to ? (await db.players.where("teamId").equals(to).filter((p) => p.prevId === player.id).count()) > 0 : false), [to, player.id]);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const r = await movePlayer(player, from, target, { number: Number(number) || player.number, deactivate });
    setDone({ copied: r.copied, team: target });
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("Subir de escalão")}>
      <form className="card grid w-full max-w-md gap-3 p-5" onClick={(e) => e.stopPropagation()} onSubmit={go}>
        <h2 className="font-semibold">{t("Subir {name} de escalão", { name: player.name.split(" ")[0] })}</h2>
        {done ? (
          <>
            <p className="text-sm">✓ {t("{name} está agora em", { name: player.name })} <b>{teamLabel(done.team)}</b>{done.copied ? t(", com {n} medições do perfil físico.", { n: done.copied }) : "."} {t("As estatísticas desta equipa continuam aqui e ligadas ao novo perfil.")}</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={() => { onOpen(done.team.id); onClose(); }}>{t("Abrir {team}", { team: done.team.category })}</button>
              <button type="button" className="btn" onClick={onClose}>{t("Fechar")}</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="mv-team">{t("Para a equipa")}</label>
              <select id="mv-team" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                {teams.map((tm) => <option key={tm.id} value={tm.id}>{teamLabel(tm)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mv-num">{t("Número na nova equipa")}</label>
              <input id="mv-num" className="input w-24" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} />
              {clash && <p className="mt-1 text-xs text-bad">{t("Esse número já está ocupado nessa equipa.")}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
              {t("Desativar nesta equipa ({team})", { team: from.category })}
            </label>
            {already && <p className="text-xs text-brand">{t("Este atleta já foi passado para essa equipa.")}</p>}
            <p className="text-[11px] text-muted">{t("Cria o atleta na outra equipa, ligado a este perfil, e copia o histórico físico (marcado com o escalão de origem).")}</p>
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" disabled={!target || !!clash || !!already}>{t("Passar para {team}", { team: target?.category ?? "…" })}</button>
              <button type="button" className="btn" onClick={onClose}>{t("Cancelar")}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
