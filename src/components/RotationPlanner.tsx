"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSeason } from "@/lib/season";
import { courtTime, equalRotation, minutesByPeriod, sum, weightedRotation } from "@/lib/rotation";
import type { Agenda, Game, GameEvent, ID, Rotation } from "@/lib/types";
import { ask } from "./Dialog";

const pl = (i: number) => `${i + 1}.º`;

/** Planned minutes per player and period; after the game, planned vs real. */
export function RotationPlanner({ game, events, canEdit }: { game: Game; events: GameEvent[]; canEdit: boolean }) {
  const info = useLiveQuery(() => db.agenda.get(game.id), [game.id]);
  const players = useLiveQuery(() => db.players.where("teamId").equals(game.teamId).sortBy("number"), [game.teamId]);
  const season = useSeason(game.teamId);
  const played = events.some((e) => e.type === "PERIOD_START");
  const real = useMemo(() => (played ? minutesByPeriod(courtTime(events, game), game) : null), [events, game, played]);
  if (info === undefined || !players) return null;

  const rot: Rotation = info?.rotation ?? {};
  const hasPlan = Object.keys(rot).length > 0;
  if (!canEdit && !hasPlan) return null;
  if (played && !hasPlan) return null;

  const P = game.periods, pm = game.periodMinutes, target = 5 * pm;
  const callup = info?.published && info.callup?.length ? info.callup : null;
  const ids: ID[] = hasPlan
    ? players.filter((p) => rot[p.id] || real?.has(p.id)).map((p) => p.id)
    : players.filter((p) => (callup ? callup.includes(p.id) : p.active)).map((p) => p.id);
  const byId = new Map(players.map((p) => [p.id, p]));
  const editable = canEdit && !played;

  const save = (next: Rotation) => {
    const base: Agenda = info ?? { id: game.id, teamId: game.teamId, kind: "game" };
    return db.agenda.put({ ...base, rotation: next });
  };
  const setCell = (id: ID, p: number, v: number) => {
    const row = [...(rot[id] ?? Array(P).fill(0))];
    row[p] = Math.max(0, Math.min(pm, Math.round(v)));
    void save({ ...rot, [id]: row });
  };
  const roster = callup ?? players.filter((p) => p.active).map((p) => p.id);
  const bySeason = () => {
    const w = new Map<ID, number>();
    season?.totals.forEach((l, id) => { if (l.gp) w.set(id, l.min / l.gp); });
    void save(weightedRotation(roster, w, P, pm));
  };
  const colSum = (p: number) => ids.reduce((a, id) => a + (rot[id]?.[p] ?? 0), 0);

  return (
    <section id="rotacao" className="card scroll-mt-20 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">{played ? "Rotação: planeado vs real" : "Rotação planeada"}</h2>
          <p className="text-xs text-muted">
            {played ? "Minutos que planeaste e os que cada um jogou." : hasPlan ? "No modo ao vivo, a app avisa quando alguém passa do previsto." : `Minutos por período para ${callup ? "os convocados" : "o plantel ativo"}. Cada período soma ${target} min.`}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-1.5">
            <button className="btn px-2.5 py-1 text-xs" onClick={() => save(equalRotation(roster, P, pm))}>Tempo igual</button>
            <button className="btn px-2.5 py-1 text-xs" onClick={bySeason} disabled={!season?.games.length}>Pela época</button>
            {hasPlan && <button className="btn px-2.5 py-1 text-xs" onClick={async () => { if (await ask("Apagar a rotação planeada?", { confirmText: "Apagar", danger: true })) void save({}); }}>Limpar</button>}
          </div>
        )}
      </div>

      {!hasPlan && editable ? (
        <p className="px-3 py-4 text-sm text-muted">Começa com <b>Tempo igual</b> (todos jogam o mesmo) ou <b>Pela época</b> (proporcional aos minutos de cada um) e depois ajusta.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Jogador</th>
                {Array.from({ length: P }, (_, i) => <th key={i} className="text-center">{pl(i)}</th>)}
                <th className="text-center">Plano</th>
                {real && <><th className="text-center">Real</th><th className="text-center">Dif.</th></>}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const p = byId.get(id);
                const row = rot[id] ?? Array(P).fill(0);
                const plan = sum(row);
                const r = real ? sum(real.get(id)) : 0;
                const d = r - plan;
                return (
                  <tr key={id}>
                    <td className="whitespace-nowrap"><b className="font-mono">#{p?.number}</b> {p?.name.split(" ")[0]}</td>
                    {row.slice(0, P).map((v, i) => (
                      <td key={i} className="text-center">
                        {editable ? (
                          <input className="input w-12 px-1 py-1 text-center font-mono pointer-coarse:w-14" inputMode="numeric" value={v || ""} placeholder="0"
                            aria-label={`${p?.name ?? ""} ${pl(i)} período`}
                            onChange={(e) => setCell(id, i, Number(e.target.value.replace(/\D/g, "") || 0))} />
                        ) : (
                          <span className="font-mono">{v || "–"}{real && <span className="block text-[10px] text-muted">{Math.round(real.get(id)?.[i] ?? 0)}</span>}</span>
                        )}
                      </td>
                    ))}
                    <td className="text-center font-mono font-semibold">{plan}</td>
                    {real && <>
                      <td className="text-center font-mono">{Math.round(r)}</td>
                      <td className={`text-center font-mono ${Math.abs(d) < 2 ? "text-muted" : d > 0 ? "text-brand" : "text-opp"}`}>{Math.abs(d) < 0.5 ? "0" : `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d))}`}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="text-xs text-muted">Soma</td>
                {Array.from({ length: P }, (_, i) => {
                  const s = colSum(i);
                  return <td key={i} className={`text-center font-mono text-xs ${s === target ? "text-good" : "text-bad"}`} title={`Deve somar ${target}`}>{s}</td>;
                })}
                <td className="text-center font-mono text-xs text-muted">{ids.reduce((a, id) => a + sum(rot[id]), 0)}</td>
                {real && <><td /><td /></>}
              </tr>
            </tfoot>
          </table>
          {real && <p className="px-3 pb-2 text-[11px] text-muted">Em cada período: plano por cima, real por baixo. Dif. positiva = jogou mais do que o previsto.{!events.some((e) => e.type === "PERIOD_END") ? " Minutos reais estimados pelo vídeo (±1 min)." : ""}</p>}
        </div>
      )}
    </section>
  );
}
