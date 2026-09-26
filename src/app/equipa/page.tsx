"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAccess, useAuth } from "@/lib/auth";
import { useTeamMembers } from "@/lib/members";
import { InviteDialog } from "@/components/InviteDialog";
import { POSITIONS, type Player, type Position } from "@/lib/types";

type Draft = { name: string; number: string; position: Position; birthYear: string; heightCm: string; notes: string };
const blank: Draft = { name: "", number: "", position: "", birthYear: "", heightCm: "", notes: "" };

export default function RosterPage() {
  const { team } = useTeam();
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
    if (editing) await db.players.update(editing, data);
    else await db.players.add({ id: uid(), teamId: team.id, active: true, createdAt: Date.now(), ...data });
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
            <h1 className="text-2xl font-semibold">Plantel</h1>
            <p className="text-sm text-muted">{players.filter((p) => p.active).length} jogadores ativos</p>
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inativos
          </label>
        </div>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Jogador</th><th>Pos</th><th>Ano</th><th>Altura</th><th></th>
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
                        ? <span className="mr-2 text-xs text-good" title={linked.email}>✓ conta ligada</span>
                        : <button className="btn btn-ghost py-1 text-brand" onClick={() => setInviting(p)}>Convidar</button>;
                    })()}
                    {access.canEdit && (
                      <>
                        <button className="btn btn-ghost py-1" onClick={() => edit(p)}>Editar</button>
                        <button className="btn btn-ghost py-1" onClick={() => db.players.update(p.id, { active: !p.active })}>
                          {p.active ? "Desativar" : "Ativar"}
                        </button>
                      </>
                    )}
                    {access.isPlayer && access.playerId === p.id && <span className="text-xs text-brand">és tu</span>}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center! text-muted">Ainda sem jogadores. Adiciona o primeiro →</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {access.canEdit && <form onSubmit={save} className="card grid h-fit gap-3 p-4">
        <h2 className="font-semibold">{editing ? "Editar jogador" : "Adicionar jogador"}</h2>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <div>
            <label className="label">Nº</label>
            <input className="input" required inputMode="numeric" pattern="\d{1,2}" value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
          </div>
          <div>
            <label className="label">Nome</label>
            <input className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
        </div>
        {taken && <p className="text-xs text-bad">Já existe um jogador ativo com o nº {draft.number}.</p>}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Posição</label>
            <select className="input" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value as Position })}>
              <option value="">–</option>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ano nasc.</label>
            <input className="input" inputMode="numeric" value={draft.birthYear} onChange={(e) => setDraft({ ...draft, birthYear: e.target.value })} />
          </div>
          <div>
            <label className="label">Altura</label>
            <input className="input" inputMode="numeric" placeholder="cm" value={draft.heightCm} onChange={(e) => setDraft({ ...draft, heightCm: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" disabled={taken}>{editing ? "Guardar" : "Adicionar"}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setDraft(blank); }}>Cancelar</button>}
        </div>
        <p className="text-xs text-muted">Só guardamos o ano de nascimento (não a data completa) — menos dados pessoais de menores.</p>
      </form>}
      {inviting && team && (
        <InviteDialog teamId={team.id} teamName={`${team.name} ${team.category}`} role="player" playerId={inviting.id}
          who={inviting.name.split(" ")[0]} onClose={() => { setInviting(null); void reload(); }} />
      )}
    </div>
  );
}
