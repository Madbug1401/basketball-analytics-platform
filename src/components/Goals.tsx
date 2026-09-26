"use client";

import { useState } from "react";
import { db, uid } from "@/lib/db";
import { fmtGoalValue, goalProgress, goalTitle, METRIC, METRICS } from "@/lib/goals";
import type { SeasonData } from "@/lib/season";
import type { Goal, GoalMetric, ID, Player } from "@/lib/types";
import { ask } from "./Dialog";

export function GoalCard({ goal, season, players, canEdit, onEdit }: {
  goal: Goal; season: SeasonData; players: Map<ID, Player>; canEdit?: boolean; onEdit?: (g: Goal) => void;
}) {
  const pr = goalProgress(goal, season);
  const def = METRIC[goal.metric];
  const p = goal.playerId ? players.get(goal.playerId) : undefined;
  const name = p ? `#${p.number} ${p.name.split(" ")[0]}` : goal.playerId ? "Jogador" : "Equipa";
  const trendUp = pr.recent !== null && pr.value !== null && (def?.lowerIsBetter ? pr.recent < pr.value : pr.recent > pr.value);
  const trendDown = pr.recent !== null && pr.value !== null && (def?.lowerIsBetter ? pr.recent > pr.value : pr.recent < pr.value);
  const overdue = goal.dueDate && !pr.reached && goal.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className={`card flex flex-col gap-2 p-4 ${goal.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-xs font-medium ${goal.playerId ? "text-brand" : "text-opp"}`}>{name}</div>
          <div className="font-semibold leading-snug">{goal.title || def?.label.replace(/ \(máx\.\)/, "") || goal.metric}</div>
        </div>
        {pr.reached
          ? <span className="shrink-0 rounded-full bg-good/20 px-2 py-0.5 text-xs font-semibold text-good">Atingido ✓</span>
          : overdue ? <span className="shrink-0 rounded-full bg-bad/15 px-2 py-0.5 text-xs text-bad">Prazo passou</span> : null}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="font-mono text-2xl font-bold tabular-nums">
          {fmtGoalValue(goal.metric, pr.value)}
          <span className="ml-1 text-sm font-normal text-muted">/ {def?.lowerIsBetter ? "máx. " : ""}{fmtGoalValue(goal.metric, goal.target)}</span>
        </div>
        {pr.recent !== null && (
          <div className={`text-right text-xs ${trendUp ? "text-good" : trendDown ? "text-bad" : "text-muted"}`}>
            {trendUp ? "▲" : trendDown ? "▼" : "•"} últimos 3: {fmtGoalValue(goal.metric, pr.recent)}
          </div>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={Math.round(pr.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pr.reached ? "bg-good" : pr.ratio > 0.75 ? "bg-brand" : "bg-brand/60"}`} style={{ width: `${Math.round(pr.ratio * 100)}%` }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{pr.sample}{goal.dueDate ? ` · até ${new Date(goal.dueDate + "T12:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}` : ""}</span>
        {canEdit && onEdit && <button className="tap -my-2 text-brand hover:underline" onClick={() => onEdit(goal)}>Editar</button>}
      </div>
    </div>
  );
}

type Draft = { id?: ID; scope: "team" | "player"; playerId: ID; metric: GoalMetric; target: string; title: string; dueDate: string; active: boolean };

export function GoalForm({ teamId, players, initial, defaultPlayer, onDone }: {
  teamId: ID; players: Player[]; initial?: Goal; defaultPlayer?: ID; onDone: () => void;
}) {
  const [d, setD] = useState<Draft>(() => initial
    ? { id: initial.id, scope: initial.playerId ? "player" : "team", playerId: initial.playerId ?? players[0]?.id ?? "", metric: initial.metric, target: String(initial.target), title: initial.title ?? "", dueDate: initial.dueDate ?? "", active: initial.active }
    : { scope: defaultPlayer ? "player" : "team", playerId: defaultPlayer ?? players[0]?.id ?? "", metric: "pts", target: String(METRIC.pts.suggest), title: "", dueDate: "", active: true });
  const [err, setErr] = useState("");

  const metrics = METRICS.filter((m) => m.scope === "both" || m.scope === d.scope);
  const def = METRIC[d.metric];

  const setScope = (scope: Draft["scope"]) => {
    const ok = METRICS.find((m) => m.id === d.metric && (m.scope === "both" || m.scope === scope));
    const metric = ok ? d.metric : "pts";
    setD({ ...d, scope, metric, target: ok ? d.target : String(METRIC[metric].suggest) });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(d.target.replace(",", "."));
    if (!isFinite(target) || target < 0) return setErr("Escreve um valor válido.");
    if (def.unit === "%" && target > 100) return setErr("A percentagem não pode passar de 100.");
    if (d.scope === "player" && !d.playerId) return setErr("Escolhe o jogador.");
    const row: Goal = {
      id: d.id ?? uid(), teamId, playerId: d.scope === "player" ? d.playerId : undefined, metric: d.metric, target,
      title: d.title.trim() || undefined, dueDate: d.dueDate || undefined, active: d.active, createdAt: initial?.createdAt ?? Date.now(),
    };
    await db.goals.put(row);
    onDone();
  };

  const remove = async () => {
    if (!d.id) return;
    if (!(await ask("Apagar este objetivo?", { confirmText: "Apagar", danger: true }))) return;
    await db.goals.delete(d.id);
    onDone();
  };

  return (
    <form onSubmit={save} className="card grid gap-3 p-4">
      <h2 className="font-semibold">{d.id ? "Editar objetivo" : "Novo objetivo"}</h2>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className={`btn ${d.scope === "team" ? "btn-primary" : ""}`} onClick={() => setScope("team")}>Equipa</button>
        <button type="button" className={`btn ${d.scope === "player" ? "btn-primary" : ""}`} onClick={() => setScope("player")}>Jogador</button>
      </div>
      {d.scope === "player" && (
        <div>
          <label className="label">Jogador</label>
          <select className="input" value={d.playerId} onChange={(e) => setD({ ...d, playerId: e.target.value })}>
            {players.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">Estatística</label>
        <select className="input" value={d.metric} onChange={(e) => { const m = e.target.value as GoalMetric; setD({ ...d, metric: m, target: String(METRIC[m].suggest) }); }}>
          {metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{def.lowerIsBetter ? "Máximo" : "Meta"} {def.unit && `(${def.unit.replace("/", "por ")})`}</label>
          <input className="input" inputMode="decimal" value={d.target} onChange={(e) => setD({ ...d, target: e.target.value })} />
        </div>
        <div>
          <label className="label">Prazo (opcional)</label>
          <input type="date" className="input" value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">Título (opcional)</label>
        <input className="input" placeholder={goalTitle({ id: "", teamId, metric: d.metric, target: Number(d.target) || 0, active: true, createdAt: 0, playerId: d.scope === "player" ? d.playerId : undefined },
          d.scope === "player" ? players.find((p) => p.id === d.playerId)?.name.split(" ")[0] : undefined)}
          value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      {d.id && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4" checked={!d.active} onChange={(e) => setD({ ...d, active: !e.target.checked })} /> Arquivar (deixa de aparecer no painel)
        </label>
      )}
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1">Guardar</button>
        <button type="button" className="btn" onClick={onDone}>Cancelar</button>
        {d.id && <button type="button" className="btn btn-danger" onClick={remove}>Apagar</button>}
      </div>
    </form>
  );
}
