import { addLines, apply, emptyLine, possessions as estPossessions, sortEvents, type Line } from "./stats";
import { possessions } from "./possessions";
import type { Game, GameEvent, ID } from "./types";

/* Lineup analysis: time and production for every 5-man unit, on/off per player, duos and trios.
   Time comes from the event clock: exact in live mode (game clock), estimated with video (each
   period's video span is scaled to the period length, like the player minutes). */

export interface Unit { ids: ID[]; secs: number; us: Line; opp: Line; possUs: number; possOpp: number }

const OT = 5 * 60;

export function gameUnits(events: GameEvent[], game: Pick<Game, "periods" | "periodMinutes">): Map<string, Unit> {
  const sorted = sortEvents(events);
  const units = new Map<string, Unit>();
  // period spans
  const spans = new Map<number, { start: number; end: number }>();
  for (const e of sorted) {
    const sp = spans.get(e.period);
    if (e.type === "PERIOD_START") spans.set(e.period, { start: e.videoTs, end: Math.max(e.videoTs, sp?.end ?? e.videoTs) });
    else if (sp) sp.end = Math.max(sp.end, e.videoTs);
  }
  const scale = (p: number) => {
    const sp = spans.get(p);
    const len = p <= game.periods ? game.periodMinutes * 60 : OT;
    return sp && sp.end > sp.start ? len / (sp.end - sp.start) : 0;
  };
  const unit = (ids: ID[]) => {
    const key = [...ids].sort().join("|");
    let u = units.get(key);
    if (!u) { u = { ids: [...ids].sort(), secs: 0, us: emptyLine(), opp: emptyLine(), possUs: 0, possOpp: 0 }; units.set(key, u); }
    return u;
  };

  let onCourt: ID[] = [];
  let segStart = 0;
  let period = 0;
  const close = (ts: number) => {
    if (onCourt.length === 5 && period) unit(onCourt).secs += Math.max(0, ts - segStart) * scale(period);
    segStart = ts;
  };

  for (const e of sorted) {
    if (e.type === "PERIOD_START") {
      if (period) close(spans.get(period)?.end ?? e.videoTs);
      period = e.period;
      onCourt = [...(e.meta?.lineup ?? [])];
      segStart = e.videoTs;
      continue;
    }
    if (e.type === "SUB" && e.meta?.in && e.meta?.out) {
      close(e.videoTs);
      onCourt = onCourt.map((p) => (p === e.meta!.out ? e.meta!.in! : p));
      continue;
    }
    if (e.type === "PERIOD_END") { close(e.videoTs); continue; }
    if (onCourt.length === 5) apply(e.side === "us" ? unit(onCourt).us : unit(onCourt).opp, e);
  }
  if (period) close(spans.get(period)?.end ?? segStart);
  // real possessions (counted from the event log) for each five on court
  for (const p of possessions(events)) {
    if (p.lineup.length !== 5) continue;
    const u = unit(p.lineup);
    if (p.side === "us") u.possUs++; else u.possOpp++;
  }
  return units;
}

export function mergeUnits(list: Map<string, Unit>[]): Map<string, Unit> {
  const out = new Map<string, Unit>();
  for (const m of list) for (const [k, u] of m) {
    const o = out.get(k);
    if (!o) out.set(k, { ids: u.ids, secs: u.secs, us: { ...u.us }, opp: { ...u.opp }, possUs: u.possUs, possOpp: u.possOpp });
    else { o.secs += u.secs; addLines(o.us, u.us); addLines(o.opp, u.opp); o.possUs += u.possUs; o.possOpp += u.possOpp; }
  }
  return out;
}

export interface Rated {
  ids: ID[]; min: number; pf: number; pa: number; poss: number;
  net100: number | null; ortg: number | null; drtg: number | null;
  tovPct: number | null; orebPct: number | null; drebPct: number | null;
}

export function rate(ids: ID[], secs: number, us: Line, opp: Line, possUs = 0, possOpp = 0): Rated {
  // counted possessions when we have them, the box-score estimate otherwise
  const oPoss = possUs || estPossessions(us);
  const dPoss = possOpp || estPossessions(opp);
  const poss = (oPoss + dPoss) / 2;
  const ok = oPoss >= 1 && dPoss >= 1;
  return {
    ids, min: secs / 60, pf: us.pts, pa: opp.pts, poss,
    net100: ok ? ((us.pts / oPoss) - (opp.pts / dPoss)) * 100 : null,
    ortg: ok ? (us.pts / oPoss) * 100 : null,
    drtg: ok ? (opp.pts / dPoss) * 100 : null,
    tovPct: oPoss >= 1 ? (us.tov / oPoss) * 100 : null,
    orebPct: us.oreb + opp.dreb ? (us.oreb / (us.oreb + opp.dreb)) * 100 : null,
    drebPct: us.dreb + opp.oreb ? (us.dreb / (us.dreb + opp.oreb)) * 100 : null,
  };
}

/** Groups of k players (2 = duos, 3 = trios) aggregated from the 5-man units. */
export function combos(units: Map<string, Unit>, k: 2 | 3): Rated[] {
  const agg = new Map<string, { ids: ID[]; secs: number; us: Line; opp: Line; possUs: number; possOpp: number }>();
  const pick = (arr: ID[], n: number): ID[][] => (n === 0 ? [[]] : arr.flatMap((x, i) => pick(arr.slice(i + 1), n - 1).map((r) => [x, ...r])));
  for (const u of units.values()) {
    for (const c of pick(u.ids, k)) {
      const key = c.join("|");
      const a = agg.get(key) ?? { ids: c, secs: 0, us: emptyLine(), opp: emptyLine(), possUs: 0, possOpp: 0 };
      a.secs += u.secs; addLines(a.us, u.us); addLines(a.opp, u.opp); a.possUs += u.possUs; a.possOpp += u.possOpp;
      agg.set(key, a);
    }
  }
  return [...agg.values()].map((a) => rate(a.ids, a.secs, a.us, a.opp, a.possUs, a.possOpp));
}

export interface OnOff { id: ID; on: Rated; off: Rated; diff: number | null }

/** Team rating with each player on court vs on the bench. */
export function onOff(units: Map<string, Unit>, playerIds: ID[]): OnOff[] {
  const total = { secs: 0, us: emptyLine(), opp: emptyLine(), possUs: 0, possOpp: 0 };
  for (const u of units.values()) { total.secs += u.secs; addLines(total.us, u.us); addLines(total.opp, u.opp); total.possUs += u.possUs; total.possOpp += u.possOpp; }
  return playerIds.map((id) => {
    const on = { secs: 0, us: emptyLine(), opp: emptyLine(), possUs: 0, possOpp: 0 };
    for (const u of units.values()) if (u.ids.includes(id)) { on.secs += u.secs; addLines(on.us, u.us); addLines(on.opp, u.opp); on.possUs += u.possUs; on.possOpp += u.possOpp; }
    const offUs = { ...total.us }, offOpp = { ...total.opp };
    (Object.keys(offUs) as (keyof Line)[]).forEach((k) => { offUs[k] -= on.us[k]; offOpp[k] -= on.opp[k]; });
    const rOn = rate([id], on.secs, on.us, on.opp, on.possUs, on.possOpp);
    const rOff = rate([id], total.secs - on.secs, offUs, offOpp, total.possUs - on.possUs, total.possOpp - on.possOpp);
    return { id, on: rOn, off: rOff, diff: rOn.net100 !== null && rOff.net100 !== null ? rOn.net100 - rOff.net100 : null };
  }).filter((x) => x.on.min > 0);
}

/* ---------- minutes management ---------- */

export interface MinutesRow {
  id: ID;
  games: number;
  avg: number;
  last3: number | null;
  max: number;
  series: number[]; // minutes per game played (chronological)
  alert?: { tone: "bad" | "info"; text: string };
}

export function minutesRows(perGame: { min: Map<ID, number> }[], playerIds: ID[], periodMinutes = 10, periods = 4): MinutesRow[] {
  const full = periodMinutes * periods;
  return playerIds.map((id) => {
    const series = perGame.map((g) => g.min.get(id)).filter((m): m is number => m !== undefined && m > 0);
    const games = series.length;
    const avg = games ? series.reduce((a, b) => a + b, 0) / games : 0;
    const l3 = series.slice(-3);
    const last3 = l3.length === 3 ? l3.reduce((a, b) => a + b, 0) / 3 : null;
    const max = games ? Math.max(...series) : 0;
    let alert: MinutesRow["alert"];
    if (last3 !== null && last3 >= full * 0.75) alert = { tone: "bad", text: `carga alta: ${last3.toFixed(0)} min nos últimos 3 jogos` };
    else if (last3 !== null && avg >= 8 && last3 > avg * 1.35) alert = { tone: "info", text: `a subir: ${last3.toFixed(0)} vs ${avg.toFixed(0)} min de média` };
    else if (last3 !== null && avg >= 8 && last3 < avg * 0.6) alert = { tone: "info", text: `a descer: ${last3.toFixed(0)} vs ${avg.toFixed(0)} min de média` };
    else if (games >= 3 && avg < full * 0.1) alert = { tone: "info", text: `poucos minutos (${avg.toFixed(1)} por jogo)` };
    return { id, games, avg, last3, max, series, alert };
  }).filter((r) => r.games > 0).sort((a, b) => b.avg - a.avg);
}
