import { sortEvents } from "./stats";
import type { Game, GameEvent, ID, Rotation } from "./types";

/* Rotation: planned minutes per player and period vs what happened.
   Court time comes from the events (PERIOD_START lineups + SUBs). In live mode the timestamps are
   the game clock, so minutes are exact; from video they are scaled to the period length. */

export interface CourtTime {
  secs: Map<ID, number[]>; // seconds on court per period (index = period − 1)
  stint: Map<ID, number>; // current stint (seconds) of the players on court at the end
  onCourt: ID[];
  dur: number[]; // timeline seconds of each period
  clock: boolean; // timestamps are the game clock (live mode)
}

const OT = 5 * 60;
const offset = (g: Game, p: number) => { let t = 0; for (let i = 1; i < p; i++) t += i <= g.periods ? g.periodMinutes * 60 : OT; return t; };

/** Seconds on court per player and period. `nowTs` closes the running period (live mode). */
export function courtTime(events: GameEvent[], game: Game, nowTs?: number): CourtTime {
  const sorted = sortEvents(events);
  const starts = sorted.filter((e) => e.type === "PERIOD_START");
  const clock = starts.length > 0 && starts.every((e) => Math.abs(e.videoTs - offset(game, e.period)) < 0.5);
  const secs = new Map<ID, number[]>();
  const add = (id: ID, p: number, s: number) => {
    const arr = secs.get(id) ?? [];
    while (arr.length < p) arr.push(0);
    arr[p - 1] += Math.max(0, s);
    secs.set(id, arr);
  };
  const dur: number[] = [];
  let onCourt: ID[] = [];
  let entered = new Map<ID, number>();
  let period = 0, start = 0, last = 0, ended = false;

  const close = (end: number) => {
    if (!period) return;
    onCourt.forEach((id) => add(id, period, end - (entered.get(id) ?? end)));
    dur[period - 1] = Math.max(0, end - start);
  };
  for (const e of sorted) {
    if (e.type === "PERIOD_START") {
      if (period && !ended) close(last);
      period = e.period; start = e.videoTs; last = e.videoTs; ended = false;
      onCourt = [...(e.meta?.lineup ?? [])];
      entered = new Map(onCourt.map((id) => [id, e.videoTs]));
      continue;
    }
    if (!period || e.period !== period) { last = Math.max(last, e.videoTs); continue; }
    if (e.type === "SUB" && e.meta?.in && e.meta.out && !ended) {
      const out = e.meta.out;
      add(out, period, e.videoTs - (entered.get(out) ?? e.videoTs));
      entered.delete(out);
      onCourt = onCourt.map((id) => (id === out ? e.meta!.in! : id));
      entered.set(e.meta.in, e.videoTs);
    }
    if (e.type === "PERIOD_END" && !ended) { close(e.videoTs); ended = true; }
    last = Math.max(last, e.videoTs);
  }
  const end = nowTs !== undefined && !ended ? Math.max(last, nowTs) : last;
  if (period && !ended) close(end);
  const stint = new Map(onCourt.map((id) => [id, ended ? 0 : Math.max(0, end - (entered.get(id) ?? end))]));
  return { secs, stint, onCourt, dur, clock };
}

/** Minutes per player and period (exact with the game clock, scaled to the period length from video). */
export function minutesByPeriod(ct: CourtTime, game: Game): Map<ID, number[]> {
  const out = new Map<ID, number[]>();
  ct.secs.forEach((arr, id) => {
    out.set(id, arr.map((s, i) => {
      if (ct.clock) return s / 60;
      const len = (i < game.periods ? game.periodMinutes : 5);
      return ct.dur[i] ? (s / ct.dur[i]) * len : 0;
    }));
  });
  return out;
}

export const sum = (a?: number[]) => (a ?? []).reduce((x, y) => x + y, 0);

/** Same minutes for everyone (whole minutes, each period adds up to 5 × period length). */
export function equalRotation(players: ID[], periods: number, pm: number): Rotation {
  const rot: Rotation = Object.fromEntries(players.map((id) => [id, Array(periods).fill(0)]));
  if (!players.length) return rot;
  const n = players.length;
  let cursor = 0;
  for (let p = 0; p < periods; p++) {
    const total = 5 * pm;
    const base = Math.min(pm, Math.floor(total / n));
    let rest = total - base * n;
    players.forEach((id) => { rot[id][p] = base; });
    // the extra minutes rotate across periods so nobody always gets them
    for (let k = 0; rest > 0 && k < n * 2; k++) {
      const id = players[(cursor + k) % n];
      if (rot[id][p] < pm) { rot[id][p]++; rest--; }
    }
    cursor = (cursor + (total % n || 1)) % n;
  }
  return rot;
}

/** Minutes following a weight (e.g. season minutes per game), capped at the period length. */
export function weightedRotation(players: ID[], weight: Map<ID, number>, periods: number, pm: number): Rotation {
  // youth teams: follow the season but pull everyone toward the average, so nobody gets squeezed out
  const raw = players.map((id) => Math.max(0, weight.get(id) ?? 0));
  const mean = raw.reduce((a, b) => a + b, 0) / (raw.length || 1);
  const w = raw.map((v) => Math.max(0.5, 0.6 * v + 0.4 * mean));
  if (w.every((x) => x === w[0])) return equalRotation(players, periods, pm);
  const rot: Rotation = Object.fromEntries(players.map((id) => [id, Array(periods).fill(0)]));
  const total = 5 * pm;
  for (let p = 0; p < periods; p++) {
    // water-filling: share the minutes by weight, capping at pm and giving the excess to the others
    const alloc = new Array(players.length).fill(0);
    let left = total;
    let free = players.map((_, i) => i);
    for (let it = 0; it < 6 && left > 1e-6 && free.length; it++) {
      const ws = free.reduce((a, i) => a + w[i], 0);
      const next: number[] = [];
      let given = 0;
      for (const i of free) {
        const want = (left * w[i]) / ws;
        const take = Math.min(pm - alloc[i], want);
        alloc[i] += take; given += take;
        if (alloc[i] < pm - 1e-6) next.push(i);
      }
      left -= given; free = next;
    }
    // round, keeping the period total
    const floor = alloc.map(Math.floor);
    let rest = total - floor.reduce((a, b) => a + b, 0);
    const order = alloc.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) { if (rest <= 0) break; if (floor[i] < pm) { floor[i]++; rest--; } }
    players.forEach((id, i) => { rot[id][p] = floor[i]; });
  }
  return rot;
}

export interface RotationAlert { playerId: ID; tone: "bad" | "warn" | "info"; text: string; score: number }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Live alerts: over the planned minutes, long stints, early fouls, bench players still owed minutes. */
export function liveAlerts(opts: {
  ct: CourtTime; game: Game; period: number; remaining: number; rotation?: Rotation;
  fouls: Map<ID, number>; bench: ID[]; stintLimit?: number;
}): RotationAlert[] {
  const { ct, game, period, remaining, rotation, fouls, bench } = opts;
  const limit = (opts.stintLimit ?? 6) * 60;
  const out: RotationAlert[] = [];
  const pIdx = period - 1;
  const regulation = period <= game.periods;
  const planned = (id: ID) => (rotation && regulation ? rotation[id]?.[pIdx] : undefined);
  const inPeriod = (id: ID) => (ct.secs.get(id)?.[pIdx] ?? 0);
  for (const id of ct.onCourt) {
    const pl = planned(id);
    const s = inPeriod(id);
    if (pl !== undefined) {
      if (s >= pl * 60 + 15) out.push({ playerId: id, tone: "bad", text: `passou do previsto neste período (${mmss(s)} / ${pl} min)`, score: 3 + (s - pl * 60) / 60 });
      else if (pl > 0 && pl * 60 - s <= 30) out.push({ playerId: id, tone: "warn", text: `a chegar ao previsto (${mmss(s)} / ${pl} min)`, score: 2 });
    }
    const st = ct.stint.get(id) ?? 0;
    if (st >= limit) out.push({ playerId: id, tone: "warn", text: `${mmss(st)} seguidos em campo`, score: 1.5 + st / 600 });
    const f = fouls.get(id) ?? 0;
    const firstHalf = period <= Math.ceil(game.periods / 2);
    if ((period === 1 && f >= 2) || (firstHalf && f >= 3) || f >= 4) out.push({ playerId: id, tone: f >= 4 ? "bad" : "warn", text: `${f} faltas${firstHalf ? " cedo no jogo" : ""}`, score: 2 + f / 2 });
  }
  if (rotation && regulation) {
    for (const id of bench) {
      const pl = planned(id);
      if (!pl) continue;
      const owed = pl * 60 - inPeriod(id);
      if (owed >= 45 && owed >= remaining - 20) out.push({ playerId: id, tone: "info", text: `ainda tem ${Math.round(owed / 60)} min previstos — faltam ${mmss(remaining)}`, score: 1 + owed / 300 });
    }
  }
  // one line per player: the worst tone, all the reasons
  const rank = { bad: 3, warn: 2, info: 1 } as const;
  const merged = new Map<ID, RotationAlert>();
  for (const a of out) {
    const m = merged.get(a.playerId);
    if (!m) { merged.set(a.playerId, { ...a }); continue; }
    m.text += ` · ${a.text}`;
    m.score = Math.max(m.score, a.score) + 0.3;
    if (rank[a.tone] > rank[m.tone]) m.tone = a.tone;
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}
