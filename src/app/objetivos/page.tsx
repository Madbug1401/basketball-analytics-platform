"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAccess } from "@/lib/auth";
import { useSeason } from "@/lib/season";
import { goalProgress } from "@/lib/goals";
import { GoalCard, GoalForm } from "@/components/Goals";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const { team } = useTeam();
  const access = useAccess(team?.id);
  const s = useSeason(team?.id);
  const goals = useLiveQuery(() => (team ? db.goals.where("teamId").equals(team.id).toArray() : []), [team?.id]);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [who, setWho] = useState<string>("all");
  const [formKey, setFormKey] = useState(0);
  const edit = (g: Goal) => { setEditing(g); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const done = () => { setEditing(null); setFormKey((k) => k + 1); };

  if (!team || !s || !goals) return null;
  const players = new Map(s.players.map((p) => [p.id, p]));
  const active = s.players.filter((p) => p.active);

  // players only see the team's goals and their own (the server enforces the same)
  const visible = goals
    .filter((g) => !access.isPlayer || !g.playerId || g.playerId === access.playerId)
    .filter((g) => showArchived || g.active)
    .filter((g) => who === "all" || (who === "team" ? !g.playerId : g.playerId === who))
    .sort((a, b) => Number(!!a.playerId) - Number(!!b.playerId) || (players.get(a.playerId ?? "")?.number ?? 0) - (players.get(b.playerId ?? "")?.number ?? 0) || a.createdAt - b.createdAt);
  const teamGoals = visible.filter((g) => !g.playerId);
  const playerGoals = visible.filter((g) => g.playerId);
  const reached = visible.filter((g) => goalProgress(g, s).reached).length;

  return (
    <div className={`grid gap-6 ${access.canEdit ? "lg:grid-cols-[1fr_360px]" : ""}`}>
      <section className="grid h-fit gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Objetivos</h1>
            <p className="text-sm text-muted">
              {visible.length ? `${reached} de ${visible.length} atingidos · o progresso é calculado a partir dos jogos e treinos registados.` : "Metas para a equipa e para cada jogador, com o progresso calculado automaticamente."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!access.isPlayer && (
              <select className="input w-auto py-1.5" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filtrar">
                <option value="all">Todos</option>
                <option value="team">Só equipa</option>
                {active.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
              </select>
            )}
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arquivados
            </label>
            {access.canEdit && <button className="btn btn-primary lg:hidden" onClick={() => setEditing("new")}>+ Novo</button>}
          </div>
        </div>

        {access.canEdit && editing && (
          <div className="lg:hidden">
            <GoalForm key={`${formKey}-${editing === "new" ? "new" : editing.id}`} teamId={team.id} players={active} initial={editing === "new" ? undefined : editing} onDone={done} />
          </div>
        )}

        {teamGoals.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Equipa</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {teamGoals.map((g) => <GoalCard key={g.id} goal={g} season={s} players={players} canEdit={access.canEdit} onEdit={edit} />)}
            </div>
          </div>
        )}
        {playerGoals.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{access.isPlayer ? "Os teus objetivos" : "Jogadores"}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {playerGoals.map((g) => <GoalCard key={g.id} goal={g} season={s} players={players} canEdit={access.canEdit} onEdit={edit} />)}
            </div>
          </div>
        )}
        {visible.length === 0 && (
          <div className="card p-8 text-center text-sm text-muted">
            {access.canEdit
              ? <>Ainda sem objetivos. Exemplos: <i>equipa com menos de 15 perdas por jogo</i>, <i>#7 com 65% nos lances livres</i>.</>
              : "O treinador ainda não definiu objetivos."}
          </div>
        )}
      </section>

      {access.canEdit && (
        <aside className="hidden h-fit lg:sticky lg:top-20 lg:block">
          <GoalForm key={`${formKey}-${editing && editing !== "new" ? editing.id : "new"}`} teamId={team.id} players={active}
            initial={editing && editing !== "new" ? editing : undefined} onDone={done} />
        </aside>
      )}
    </div>
  );
}
