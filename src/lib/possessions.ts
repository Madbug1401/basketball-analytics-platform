import { pointsOf, sortEvents } from "./stats";
import type { GameEvent, ID, PlayTag, Side } from "./types";

/* Possessions are derived from the event log — nothing extra to record.
   Who has the ball is implied by each event (a shot/turnover/assist belongs to the offense, a
   steal/block/foul/defensive rebound to the defense). A possession ends on a made basket (after any
   and-one / free throws), a turnover, a defensive rebound or the end of the period. An offensive
   rebound keeps the same possession (second chance). */

export interface Possession {
  id: number;
  side: Side;
  period: number;
  start: number; // video / game seconds
  end: number;
  events: GameEvent[];
  pts: number;
  result: "score" | "tov" | "miss" | "other";
  tags: PlayTag[];
  secondChance: boolean; // had an offensive rebound
  secondChancePts: number; // points after the first offensive rebound
  lineup: ID[]; // our five on court when it started
}

const other = (s: Side): Side => (s === "us" ? "opp" : "us");

/** Side that has the ball according to this event (undefined = neutral event). */
export function offenseOf(e: GameEvent): Side | undefined {
  switch (e.type) {
    case "SHOT": case "FT": case "TOV": case "AST": case "FOUL_DRAWN": return e.side;
    case "REB": return e.meta?.off ? e.side : other(e.side);
    case "STL": case "BLK": case "FOUL": return other(e.side);
    default: return undefined; // SUB, PERIOD_START/END, TIMEOUT
  }
}

export function possessions(events: GameEvent[]): Possession[] {
  const out: Possession[] = [];
  let cur: Possession | null = null;
  let closable: "no" | "afterScore" | "hard" = "no";
  let onCourt: ID[] = [];
  let period = 0;

  const close = () => {
    if (cur && cur.events.length) {
      const last = cur.events[cur.events.length - 1];
      cur.end = last.videoTs;
      if (cur.result === "other") {
        const hasMiss = cur.events.some((e) => (e.type === "SHOT" || e.type === "FT") && !e.meta?.made);
        cur.result = cur.pts > 0 ? "score" : hasMiss ? "miss" : "other";
      }
      out.push(cur);
    }
    cur = null;
    closable = "no";
  };
  const open = (side: Side, e: GameEvent) => {
    cur = { id: out.length + 1, side, period: e.period, start: e.videoTs, end: e.videoTs, events: [], pts: 0, result: "other", tags: [], secondChance: false, secondChancePts: 0, lineup: [...onCourt] };
  };

  for (const e of sortEvents(events)) {
    if (e.type === "PERIOD_START") { close(); period = e.period; onCourt = [...(e.meta?.lineup ?? [])]; continue; }
    if (e.type === "PERIOD_END") { close(); continue; }
    if (e.type === "SUB" && e.meta?.in && e.meta?.out) { onCourt = onCourt.map((p) => (p === e.meta!.out ? e.meta!.in! : p)); continue; }
    const side = offenseOf(e);
    if (!side) continue;
    if (e.period !== period) { close(); period = e.period; }

    const c = cur as Possession | null;
    // events that still belong to a finished possession: and-one / free throws / the assist logged after a
    // basket, and the steal logged with a turnover
    const tail = (closable === "afterScore" && ["FT", "AST", "FOUL_DRAWN", "FOUL"].includes(e.type))
      || (closable === "hard" && e.type === "STL");
    const continues = c && c.side === side && (closable === "no" || tail);
    if (!continues) { close(); open(side, e); }
    const p = cur as unknown as Possession;
    p.events.push(e);
    const pts = e.side === p.side ? pointsOf(e) : 0;
    p.pts += pts;
    if (p.secondChance) p.secondChancePts += pts;
    for (const t of e.meta?.tags ?? []) if (!p.tags.includes(t)) p.tags.push(t);
    if (e.type === "REB" && e.meta?.off && e.side === p.side) p.secondChance = true;

    if (e.type === "TOV" && e.side === p.side) { p.result = "tov"; closable = "hard"; }
    else if ((e.type === "SHOT" || e.type === "FT") && e.side === p.side && e.meta?.made) closable = "afterScore";
    else if ((e.type === "SHOT" || e.type === "FT") && e.side === p.side && !e.meta?.made) closable = "no"; // rebound decides
  }
  close();
  return out;
}

export interface SideProfile {
  poss: number;
  pts: number;
  ppp: number | null;
  efg: number | null; // %
  tovPct: number | null; // % of possessions ending in a turnover
  orebPct: number | null; // % of available offensive rebounds
  ftRate: number | null; // FTA per FGA
  transition: { poss: number; pts: number; ppp: number | null };
  halfCourt: { poss: number; pts: number; ppp: number | null }; // tagged, not transition
  secondChancePts: number;
}

const ratio = (a: number, b: number) => (b ? a / b : null);

export function profile(events: GameEvent[], poss: Possession[], side: Side): SideProfile {
  const mine = poss.filter((p) => p.side === side);
  let fga = 0, fgm = 0, p3m = 0, fta = 0, oreb = 0, oppDreb = 0;
  for (const e of events) {
    if (e.side === side) {
      if (e.type === "SHOT") { fga++; if (e.meta?.made) { fgm++; if (e.meta.pts === 3) p3m++; } }
      if (e.type === "FT") fta++;
      if (e.type === "REB" && e.meta?.off) oreb++;
    } else if (e.type === "REB" && !e.meta?.off) oppDreb++;
  }
  const pts = mine.reduce((a, p) => a + p.pts, 0);
  const tr = mine.filter((p) => p.tags.includes("transicao"));
  const hc = mine.filter((p) => p.tags.length && !p.tags.includes("transicao"));
  const sum = (l: Possession[]) => l.reduce((a, p) => a + p.pts, 0);
  return {
    poss: mine.length, pts,
    ppp: ratio(pts, mine.length),
    efg: fga ? ((fgm + 0.5 * p3m) / fga) * 100 : null,
    tovPct: mine.length ? (mine.filter((p) => p.result === "tov").length / mine.length) * 100 : null,
    orebPct: oreb + oppDreb ? (oreb / (oreb + oppDreb)) * 100 : null,
    ftRate: ratio(fta, fga),
    transition: { poss: tr.length, pts: sum(tr), ppp: ratio(sum(tr), tr.length) },
    halfCourt: { poss: hc.length, pts: sum(hc), ppp: ratio(sum(hc), hc.length) },
    secondChancePts: mine.reduce((a, p) => a + p.secondChancePts, 0),
  };
}
