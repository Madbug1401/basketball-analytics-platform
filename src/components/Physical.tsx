"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { MEASURE, MEASURES, apeIndex, byDate, fmtDelta, fmtValue, growthTone, growthVelocity, historyOf, trendOf } from "@/lib/physical";
import type { MeasureType, Measurement, Player } from "@/lib/types";

const shortDate = (d: string) => new Date(d + "T12:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "2-digit" });

/** Tiny line chart of a history; measurements outside the protocol are hollow. */
export function Spark({ points, lowerIsBetter }: { points: Measurement[]; lowerIsBetter?: boolean }) {
  if (points.length < 2) return null;
  const W = 120, H = 34, P = 4;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points[points.length - 1].date);
  const vs = points.map((p) => p.value);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (d: string) => P + (t1 > t0 ? ((Date.parse(d) - t0) / (t1 - t0)) * (W - 2 * P) : (W - 2 * P) / 2);
  // better is always up
  const y = (v: number) => (hi === lo ? H / 2 : lowerIsBetter ? P + ((v - lo) / (hi - lo)) * (H - 2 * P) : H - P - ((v - lo) / (hi - lo)) * (H - 2 * P));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" aria-hidden>
      <polyline fill="none" stroke="var(--color-brand)" strokeWidth={1.5} points={points.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")} />
      {points.map((p) => (
        <circle key={p.id} cx={x(p.date)} cy={y(p.value)} r={2.6}
          fill={p.protocolOk === false ? "var(--color-panel)" : "var(--color-brand)"} stroke="var(--color-brand)" strokeWidth={1.2} />
      ))}
    </svg>
  );
}

/** Physical profile on the player page (staff: everything; the player: everything except weight). */
export function PhysicalProfile({ player, isStaff }: { player: Player; isStaff: boolean }) {
  const all = useLiveQuery(() => db.measurements.where("playerId").equals(player.id).toArray(), [player.id]);
  const prev = useLiveQuery(async () => {
    if (!player.prevId) return null;
    const p = await db.players.get(player.prevId);
    return p ? { p, team: await db.teams.get(p.teamId) } : null;
  }, [player.prevId]);
  const [open, setOpen] = useState(false);
  if (!all) return null;
  const visible = all.filter((m) => isStaff || !MEASURE[m.type].staffOnly);
  if (!visible.length && !isStaff) return null;

  const types = MEASURES.filter((d) => (isStaff || !d.staffOnly) && visible.some((m) => m.type === d.type));
  const growth = growthVelocity(visible, player.id);
  const ape = apeIndex(visible, player.id);

  return (
    <section id="fisico" className="scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Perfil físico</h2>
        <div className="flex items-center gap-3 text-sm">
          {prev && <Link href={`/jogadores/${prev.p.id}`} className="tap text-muted hover:text-fg">Escalão anterior ({prev.team?.category ?? "—"}) →</Link>}
          {isStaff && <Link href="/fisico" className="tap text-brand">Registar testes</Link>}
        </div>
      </div>
      {!visible.length ? (
        <p className="card p-4 text-sm text-muted">Ainda sem medições. Regista a primeira bateria de testes em <Link href="/fisico" className="text-brand">Físico</Link>.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {types.map((d) => {
              const tr = trendOf(visible, player.id, d.type);
              const h = historyOf(visible, player.id, d.type);
              return (
                <div key={d.type} className="card px-3 py-2">
                  <div className="flex items-baseline justify-between gap-1 text-xs text-muted">
                    <span className="truncate">{d.short}</span>
                    {tr.last && <span className="shrink-0">{shortDate(tr.last.date)}</span>}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="font-mono text-xl font-semibold">{fmtValue(d.type, tr.last?.value)}</span>
                    {tr.delta !== null && (
                      <span className={`font-mono text-xs ${tr.better === null ? "text-muted" : d.kind === "body" ? "text-muted" : tr.better ? "text-good" : "text-bad"}`}
                        title={`desde ${shortDate(tr.first!.date)}`}>{fmtDelta(d.type, tr.delta)}</span>
                    )}
                  </div>
                  <Spark points={h} lowerIsBetter={d.lowerIsBetter} />
                  {tr.last?.protocolOk === false && <div className="text-[10px] text-brand">⚠ última fora do protocolo</div>}
                </div>
              );
            })}
            {growth && (
              <div className="card px-3 py-2">
                <div className="text-xs text-muted">Crescimento</div>
                <div className={`mt-0.5 font-mono text-xl font-semibold ${growthTone(growth.cmPerYear)}`}>{growth.cmPerYear.toFixed(1).replace(".", ",")} <span className="text-sm">cm/ano</span></div>
                <div className="text-[10px] leading-tight text-muted">{growth.cmPerYear >= 7 ? "Provável pico de crescimento: atenção à carga e à coordenação." : `desde ${shortDate(growth.since)}`}</div>
              </div>
            )}
            {ape !== null && (
              <div className="card px-3 py-2">
                <div className="text-xs text-muted">Envergadura − altura</div>
                <div className="mt-0.5 font-mono text-xl font-semibold">{ape > 0 ? "+" : ape < 0 ? "−" : ""}{Math.abs(ape).toFixed(0)} <span className="text-sm">cm</span></div>
                <div className="text-[10px] leading-tight text-muted">{ape >= 5 ? "Braços longos: vantagem a defender e no ressalto." : "Positivo = braços mais longos que a altura."}</div>
              </div>
            )}
          </div>
          <button className="tap mt-2 text-sm text-muted hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "▾" : "▸"} Todas as medições ({visible.length})</button>
          {open && (
            <div className="card mt-1 overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Data</th><th>Medida</th><th>Resultado</th><th>Tentativas</th><th>Avaliador</th><th>Protocolo</th></tr></thead>
                <tbody>
                  {[...visible].sort(byDate).reverse().map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{shortDate(m.date)}</td>
                      <td>{MEASURE[m.type].short}{m.fromTeam && <span className="ml-1 rounded bg-panel-2 px-1 text-[10px] text-muted">{m.fromTeam}</span>}</td>
                      <td className="font-mono">{fmtValue(m.type, m.value)}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-muted">{m.attempts?.length ? m.attempts.map((a) => String(a).replace(".", ",")).join(" · ") + (m.base ? ` (alcance ${m.base})` : "") : "–"}</td>
                      <td className="text-xs text-muted">{m.evaluator ?? "–"}</td>
                      <td className="text-xs">{m.protocolOk === false ? <span className="text-brand" title={m.notes}>⚠ fora</span> : m.protocolOk ? <span className="text-good">✓</span> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export type { MeasureType };
