import { eff, gameStats, reb, sortEvents } from "./stats";
import { fmtGoalValue, goalProgress, goalTitle } from "./goals";
import type { SeasonData } from "./season";
import type { Game, GameEvent, Goal, ID, PlayerReport, ReportClip } from "./types";
import { t } from "./i18n";

/* Individual post-game report: the player's line, how it compares with their season,
   one play to repeat and one to improve (with the video), and their personal goal. */

const clip = (e: GameEvent, label: string): ReportClip => ({ start: Math.max(0, Math.floor(e.videoTs - 6)), end: Math.ceil(e.videoTs + 3), label });
const when = (g: Game, p: number) => (p <= g.periods ? t("{p}.º período", { p }) : t("prolongamento"));

function pickGood(evs: GameEvent[], g: Game): ReportClip | undefined {
  let best: { s: number; e: GameEvent; label: string } | undefined;
  for (const e of evs) {
    const late = e.period >= g.periods ? 1 : 0;
    let s = 0, label = "";
    if (e.type === "SHOT" && e.meta?.made) { s = e.meta.pts === 3 ? 3 : 2.2; label = e.meta.pts === 3 ? t("Triplo convertido") : t("Cesto de 2"); }
    else if (e.type === "AST") { s = 2.6; label = t("Assistência"); }
    else if (e.type === "STL") { s = 2.5; label = t("Roubo de bola"); }
    else if (e.type === "BLK") { s = 2.3; label = t("Desarme de lançamento"); }
    else if (e.type === "REB" && e.meta?.off) { s = 1.6; label = t("Ressalto ofensivo"); }
    else if (e.type === "FOUL_DRAWN") { s = 1.2; label = t("Falta sofrida"); }
    if (!s) continue;
    s += late + (e.meta?.tags?.includes("transicao") ? 0.2 : 0);
    if (!best || s > best.s) best = { s, e, label: `${label} (${when(g, e.period)})` };
  }
  return best && clip(best.e, best.label);
}

function pickImprove(evs: GameEvent[], g: Game): ReportClip | undefined {
  let worst: { s: number; e: GameEvent; label: string } | undefined;
  for (const e of evs) {
    const late = e.period >= g.periods ? 1 : 0;
    let s = 0, label = "";
    if (e.type === "TOV") { s = 3; label = t("Perda de bola"); }
    else if (e.type === "FOUL") { s = 1.6; label = t("Falta"); }
    else if (e.type === "SHOT" && !e.meta?.made) { s = e.meta?.pts === 3 ? 1.1 : 1.4; label = e.meta?.pts === 3 ? t("Triplo falhado") : t("Lançamento falhado"); }
    else if (e.type === "FT" && !e.meta?.made) { s = 0.8; label = t("Lance livre falhado"); }
    if (!s) continue;
    s += late;
    if (!worst || s > worst.s) worst = { s, e, label: `${label} (${when(g, e.period)})` };
  }
  return worst && clip(worst.e, worst.label);
}

export function buildReport(game: Game, events: GameEvent[], season: SeasonData | undefined, playerId: ID, goals: Goal[], playerName?: string): PlayerReport | null {
  const stats = gameStats(events, game.periods, game.periodMinutes);
  const l = stats.players.get(playerId);
  if (!l?.gp) return null;
  const mine = sortEvents(events).filter((e) => e.side === "us" && e.playerId === playerId);

  // season before this game
  const before = (season?.games ?? []).filter((g) => g.game.id !== game.id && g.game.date <= game.date);
  const prev = before.map((g) => g.stats.players.get(playerId)).filter((x): x is NonNullable<typeof x> => !!x?.gp);
  const n = prev.length;
  const avg = n ? {
    pts: prev.reduce((a, x) => a + x.pts, 0) / n,
    reb: prev.reduce((a, x) => a + reb(x), 0) / n,
    ast: prev.reduce((a, x) => a + x.ast, 0) / n,
    tov: prev.reduce((a, x) => a + x.tov, 0) / n,
    eff: prev.reduce((a, x) => a + eff(x), 0) / n,
    games: n,
  } : undefined;

  const goal = goals.find((g) => g.active && g.playerId === playerId);
  let goalInfo: PlayerReport["goal"];
  if (goal && season) {
    const pr = goalProgress(goal, season);
    goalInfo = { title: goalTitle(goal, playerName), value: t("{value} (objetivo {target})", { value: fmtGoalValue(goal.metric, pr.value), target: fmtGoalValue(goal.metric, goal.target) }), progress: Math.max(0, Math.min(1, pr.ratio)) };
  }

  return {
    gameId: game.id, opponent: game.opponent, home: game.home, date: game.date,
    score: [stats.us.pts, stats.opp.pts],
    line: {
      min: Math.round(l.min), pts: l.pts, reb: reb(l), ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf,
      fgm: l.fgm, fga: l.fga, p3m: l.p3m, p3a: l.p3a, ftm: l.ftm, fta: l.fta, pm: l.pm, eff: eff(l),
    },
    avg,
    good: pickGood(mine, game),
    improve: pickImprove(mine, game),
    goal: goalInfo,
    trend: [...prev.slice(-4).map(eff), eff(l)],
  };
}

/** A starting line for the coach's message, based on the numbers. */
export function suggestText(r: PlayerReport, first: string) {
  const bits: string[] = [];
  const a = r.avg;
  if (a && r.line.eff >= a.eff + 3) bits.push(t("um dos teus melhores jogos da época"));
  else if (a && r.line.eff <= a.eff - 4) bits.push(t("um jogo abaixo do teu nível, acontece"));
  if (r.line.ast >= 4) bits.push(t("boa partilha de bola"));
  if (r.line.tov >= 4) bits.push(t("temos de cuidar mais da bola"));
  if (r.line.reb >= 7) bits.push(t("muito presente no ressalto"));
  return t("{name}, {notes}. Vê as duas jogadas abaixo.", { name: first, notes: bits.length ? bits.join(", ") : t("obrigado pelo esforço") });
}
