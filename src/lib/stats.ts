import type { GameEvent, ID, Player, PlayTag } from "./types";
import { zoneOf, type Zone } from "./court";
import { L, t } from "./i18n";

export interface Line {
  pts: number;
  fgm: number; fga: number;
  p2m: number; p2a: number;
  p3m: number; p3a: number;
  ftm: number; fta: number;
  oreb: number; dreb: number;
  ast: number; stl: number; blk: number; tov: number;
  pf: number; fd: number;
  pm: number; // plus/minus
  gp: number; // games with at least one event or on-court appearance
  min: number; // estimated minutes (see playerMinutes)
}

export const emptyLine = (): Line => ({
  pts: 0, fgm: 0, fga: 0, p2m: 0, p2a: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fd: 0, pm: 0, gp: 0, min: 0,
});

export const reb = (l: Line) => l.oreb + l.dreb;
export const pct = (m: number, a: number) => (a ? Math.round((m / a) * 1000) / 10 : null);
export const fmtPct = (m: number, a: number) => {
  const p = pct(m, a);
  return p === null ? "–" : `${p.toFixed(1)}%`;
};
/** Simple efficiency: PTS + REB + AST + STL + BLK − missed FG − missed FT − TOV */
export const eff = (l: Line) =>
  l.pts + reb(l) + l.ast + l.stl + l.blk - (l.fga - l.fgm) - (l.fta - l.ftm) - l.tov;
/** Possessions estimate (team level) */
export const possessions = (l: Line) => l.fga - l.oreb + l.tov + 0.44 * l.fta;

export function sortEvents(events: GameEvent[]) {
  return [...events].sort((a, b) => a.videoTs - b.videoTs || a.createdAt - b.createdAt);
}

export function apply(line: Line, e: GameEvent) {
  const m = e.meta ?? {};
  switch (e.type) {
    case "SHOT":
      line.fga++;
      if (m.pts === 3) line.p3a++; else line.p2a++;
      if (m.made) {
        line.fgm++;
        line.pts += m.pts ?? 2;
        if (m.pts === 3) line.p3m++; else line.p2m++;
      }
      break;
    case "FT":
      line.fta++;
      if (m.made) { line.ftm++; line.pts++; }
      break;
    case "REB": if (m.off) line.oreb++; else line.dreb++; break;
    case "AST": line.ast++; break;
    case "STL": line.stl++; break;
    case "BLK": line.blk++; break;
    case "TOV": line.tov++; break;
    case "FOUL": line.pf++; break;
    case "FOUL_DRAWN": line.fd++; break;
  }
}

export const pointsOf = (e: GameEvent) =>
  e.type === "SHOT" && e.meta?.made ? (e.meta.pts ?? 2) : e.type === "FT" && e.meta?.made ? 1 : 0;

/** Walks the sorted log, tracking who is on court, and hands each event the lineup at that moment. */
export function walk(events: GameEvent[], fn: (e: GameEvent, onCourt: ID[]) => void) {
  let onCourt: ID[] = [];
  for (const e of sortEvents(events)) {
    if (e.type === "PERIOD_START") onCourt = [...(e.meta?.lineup ?? [])];
    else if (e.type === "SUB" && e.meta?.in && e.meta?.out) {
      onCourt = onCourt.map((p) => (p === e.meta!.out ? e.meta!.in! : p));
      if (!onCourt.includes(e.meta.in)) onCourt.push(e.meta.in);
    }
    fn(e, onCourt);
  }
  return onCourt;
}

export interface GameStats {
  us: Line;
  opp: Line;
  players: Map<ID, Line>;
  byPeriod: { us: number; opp: number }[];
  lineups: Map<string, { ids: ID[]; pf: number; pa: number; events: number }>;
}

export function gameStats(events: GameEvent[], periods = 4, periodMinutes = 10): GameStats {
  const us = emptyLine();
  const opp = emptyLine();
  const players = new Map<ID, Line>();
  const byPeriod = Array.from({ length: Math.max(periods, 1) }, () => ({ us: 0, opp: 0 }));
  const lineups: GameStats["lineups"] = new Map();
  const appeared = new Set<ID>();
  const get = (id: ID) => {
    let l = players.get(id);
    if (!l) { l = emptyLine(); players.set(id, l); }
    return l;
  };

  walk(events, (e, onCourt) => {
    onCourt.forEach((id) => appeared.add(id));
    if (e.type === "PERIOD_START" || e.type === "SUB") {
      if (e.type === "SUB" && e.meta?.in) appeared.add(e.meta.in);
      return;
    }
    const pts = pointsOf(e);
    while (byPeriod.length < e.period) byPeriod.push({ us: 0, opp: 0 });
    if (e.side === "us") {
      apply(us, e);
      if (e.playerId) { apply(get(e.playerId), e); appeared.add(e.playerId); }
      if (pts) byPeriod[e.period - 1].us += pts;
    } else {
      apply(opp, e);
      if (pts) byPeriod[e.period - 1].opp += pts;
    }
    if (pts && onCourt.length) {
      const sign = e.side === "us" ? 1 : -1;
      onCourt.forEach((id) => (get(id).pm += sign * pts));
      if (onCourt.length === 5) {
        const key = [...onCourt].sort().join("|");
        const lu = lineups.get(key) ?? { ids: [...onCourt], pf: 0, pa: 0, events: 0 };
        if (sign > 0) lu.pf += pts; else lu.pa += pts;
        lineups.set(key, lu);
      }
    }
    if (onCourt.length === 5) {
      const key = [...onCourt].sort().join("|");
      const lu = lineups.get(key) ?? { ids: [...onCourt], pf: 0, pa: 0, events: 0 };
      lu.events++;
      lineups.set(key, lu);
    }
  });
  appeared.forEach((id) => (get(id).gp = 1));
  playerMinutes(events, periodMinutes).forEach((m, id) => (get(id).min = m));
  us.pm = us.pts - opp.pts; // team +/- is the point differential
  opp.pm = -us.pm;
  return { us, opp, players, byPeriod, lineups };
}

export function addLines(a: Line, b: Line) {
  (Object.keys(a) as (keyof Line)[]).forEach((k) => (a[k] += b[k]));
  return a;
}

export interface ShotAgg { zone: Zone; m: number; a: number }
export function shotZones(shots: GameEvent[]): ShotAgg[] {
  const map = new Map<Zone, ShotAgg>();
  for (const s of shots) {
    if (s.type !== "SHOT" || s.x === undefined || s.y === undefined) continue;
    const z = zoneOf(s.x, s.y);
    const agg = map.get(z) ?? { zone: z, m: 0, a: 0 };
    agg.a++;
    if (s.meta?.made) agg.m++;
    map.set(z, agg);
  }
  return [...map.values()];
}

export const playerLabel = (p?: Player) => (p ? `#${p.number} ${p.name}` : "—");

export function fmtTs(s: number) {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(sec).padStart(2, "0")}`;
}

export const EVENT_LABEL: Record<string, string> = {
  SHOT: L("Lançamento"), FT: L("Lance livre"), REB: L("Ressalto"), AST: L("Assistência"), STL: L("Roubo"),
  BLK: L("Desarme"), TOV: L("Perda de bola"), FOUL: L("Falta"), FOUL_DRAWN: L("Falta sofrida"),
  SUB: L("Substituição"), PERIOD_START: L("Início período"), PERIOD_END: L("Fim do período"), TIMEOUT: L("Desconto de tempo"),
};

/** Short period label: "P1" (pt) · "Q1" (en) · "QT1" (fr). */
export const periodLabel = (n: number) => t("P{n}", { n });

/** Translated event name (EVENT_LABEL holds the Portuguese keys). */
export const eventLabel = (type: string) => { const label = EVENT_LABEL[type]; return label ? t(label) : type; };

export function describe(e: GameEvent, name: (id?: ID) => string) {
  const m = e.meta ?? {};
  switch (e.type) {
    case "SHOT": return m.pts === 3 ? (m.made ? t("3PT ✓ convertido") : t("3PT ✗ falhado")) : (m.made ? t("2PT ✓ convertido") : t("2PT ✗ falhado"));
    case "FT": return m.made ? t("LL ✓") : t("LL ✗");
    case "REB": return m.off ? t("Ressalto ofensivo") : t("Ressalto defensivo");
    case "SUB": return t("Entra {in} · Sai {out}", { in: name(m.in), out: name(m.out) });
    case "PERIOD_START": return t("Início {n}.º período — {lineup}", { n: e.period, lineup: (m.lineup ?? []).map((id) => name(id)).join(", ") });
    case "PERIOD_END": return t("Fim do {n}.º período", { n: e.period });
    case "TIMEOUT": return t("Desconto de tempo");
    default: return eventLabel(e.type);
  }
}

/**
 * Minutes are estimated from video time: for each period, a player's share of the
 * period's video duration (first to last event) on court × period length.
 * Stoppages are spread evenly, so it is an approximation (±1–2 min).
 */
export function playerMinutes(events: GameEvent[], periodMinutes = 10) {
  const total = new Map<ID, number>();
  const sorted = sortEvents(events);
  let onCourt: ID[] = [];
  let periodStart = 0;
  let lastTs = 0;
  let entered = new Map<ID, number>();
  let acc = new Map<ID, number>();
  let open = false;

  const closePeriod = (end: number) => {
    if (!open) return;
    onCourt.forEach((id) => acc.set(id, (acc.get(id) ?? 0) + (end - (entered.get(id) ?? end))));
    const dur = end - periodStart;
    if (dur > 0) acc.forEach((sec, id) => total.set(id, (total.get(id) ?? 0) + (sec / dur) * periodMinutes));
    acc = new Map();
    entered = new Map();
    open = false;
  };

  for (const e of sorted) {
    if (e.type === "PERIOD_START") {
      closePeriod(lastTs);
      periodStart = e.videoTs;
      onCourt = [...(e.meta?.lineup ?? [])];
      onCourt.forEach((id) => entered.set(id, e.videoTs));
      open = true;
    } else if (e.type === "SUB" && e.meta?.in && e.meta?.out && open) {
      const out = e.meta.out;
      acc.set(out, (acc.get(out) ?? 0) + (e.videoTs - (entered.get(out) ?? e.videoTs)));
      entered.delete(out);
      onCourt = onCourt.map((p) => (p === out ? e.meta!.in! : p));
      entered.set(e.meta.in, e.videoTs);
    }
    lastTs = e.videoTs;
  }
  closePeriod(lastTs);
  return total;
}

export const fmtMin = (m: number) => (m ? String(Math.round(m)) : "–");

/* ---------- play context (tags) ---------- */

export interface TagAgg { tag: PlayTag; fga: number; fgm: number; fta: number; ftm: number; tov: number; pts: number; plays: number }

/** Offensive efficiency per play context, for one side. plays ≈ FGA + TOV + 0.44·FTA. */
export function tagStats(events: GameEvent[], side: "us" | "opp"): { tags: TagAgg[]; tagged: number; total: number } {
  const map = new Map<PlayTag, TagAgg>();
  let tagged = 0, total = 0;
  for (const e of events) {
    if (e.side !== side || !(e.type === "SHOT" || e.type === "FT" || e.type === "TOV")) continue;
    if (e.type !== "FT") total++;
    const tags = e.meta?.tags ?? [];
    if (tags.length && e.type !== "FT") tagged++;
    for (const tag of tags) {
      const a = map.get(tag) ?? { tag, fga: 0, fgm: 0, fta: 0, ftm: 0, tov: 0, pts: 0, plays: 0 };
      if (e.type === "SHOT") { a.fga++; if (e.meta?.made) { a.fgm++; a.pts += e.meta.pts ?? 2; } }
      else if (e.type === "FT") { a.fta++; if (e.meta?.made) { a.ftm++; a.pts++; } }
      else a.tov++;
      a.plays = a.fga + a.tov + 0.44 * a.fta;
      map.set(tag, a);
    }
  }
  return { tags: [...map.values()].sort((a, b) => b.plays - a.plays), tagged, total };
}

/** Points per play, formatted. */
export const ppp = (a: TagAgg) => (a.plays ? (a.pts / a.plays).toFixed(2) : "–");
