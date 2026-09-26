import type { SeasonData } from "./season";
import { eff, pct, reb, type Line } from "./stats";
import type { Goal, GoalMetric } from "./types";

export interface MetricDef {
  id: GoalMetric;
  label: string;
  unit: "/jogo" | "%" | "";
  lowerIsBetter?: boolean;
  scope: "player" | "team" | "both";
  /** default target suggested in the form */
  suggest: number;
}

export const METRICS: MetricDef[] = [
  { id: "pts", label: "Pontos por jogo", unit: "/jogo", scope: "both", suggest: 10 },
  { id: "reb", label: "Ressaltos por jogo", unit: "/jogo", scope: "both", suggest: 6 },
  { id: "oreb", label: "Ressaltos ofensivos por jogo", unit: "/jogo", scope: "both", suggest: 2 },
  { id: "ast", label: "Assistências por jogo", unit: "/jogo", scope: "both", suggest: 3 },
  { id: "stl", label: "Roubos por jogo", unit: "/jogo", scope: "both", suggest: 2 },
  { id: "blk", label: "Desarmes por jogo", unit: "/jogo", scope: "both", suggest: 1 },
  { id: "tov", label: "Perdas de bola por jogo (máx.)", unit: "/jogo", lowerIsBetter: true, scope: "both", suggest: 2 },
  { id: "p3m", label: "Triplos convertidos por jogo", unit: "/jogo", scope: "both", suggest: 1 },
  { id: "eff", label: "Eficiência por jogo", unit: "/jogo", scope: "player", suggest: 8 },
  { id: "fg_pct", label: "% lançamentos de campo", unit: "%", scope: "both", suggest: 40 },
  { id: "p3_pct", label: "% triplos", unit: "%", scope: "both", suggest: 30 },
  { id: "ft_pct", label: "% lances livres", unit: "%", scope: "both", suggest: 65 },
  { id: "att_pct", label: "Assiduidade nos treinos", unit: "%", scope: "player", suggest: 90 },
  { id: "opp_pts", label: "Pontos sofridos por jogo (máx.)", unit: "/jogo", lowerIsBetter: true, scope: "team", suggest: 55 },
  { id: "wins", label: "Vitórias na época", unit: "", scope: "team", suggest: 8 },
];
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<GoalMetric, MetricDef>;

export interface GoalProgress {
  value: number | null; // current season value
  recent: number | null; // average of the last 3 games (trend)
  sample: string; // "12 jogos", "34/52 LL"…
  ratio: number; // 0..1 how close to the target (1 = reached)
  reached: boolean;
}

const per = (v: number, gp: number) => (gp ? v / gp : null);

function lineValue(metric: GoalMetric, l: Line, gp: number): { value: number | null; sample: string } {
  switch (metric) {
    case "pts": return { value: per(l.pts, gp), sample: `${gp} jogos` };
    case "reb": return { value: per(reb(l), gp), sample: `${gp} jogos` };
    case "oreb": return { value: per(l.oreb, gp), sample: `${gp} jogos` };
    case "ast": return { value: per(l.ast, gp), sample: `${gp} jogos` };
    case "stl": return { value: per(l.stl, gp), sample: `${gp} jogos` };
    case "blk": return { value: per(l.blk, gp), sample: `${gp} jogos` };
    case "tov": return { value: per(l.tov, gp), sample: `${gp} jogos` };
    case "p3m": return { value: per(l.p3m, gp), sample: `${gp} jogos` };
    case "eff": return { value: per(eff(l), gp), sample: `${gp} jogos` };
    case "fg_pct": return { value: pct(l.fgm, l.fga), sample: `${l.fgm}/${l.fga} LC` };
    case "p3_pct": return { value: pct(l.p3m, l.p3a), sample: `${l.p3m}/${l.p3a} triplos` };
    case "ft_pct": return { value: pct(l.ftm, l.fta), sample: `${l.ftm}/${l.fta} LL` };
    default: return { value: null, sample: "" };
  }
}

function ratioOf(value: number | null, target: number, lower?: boolean) {
  if (value === null) return 0;
  if (lower) return value <= target ? 1 : Math.max(0, Math.min(1, target / value));
  return target <= 0 ? 1 : Math.max(0, Math.min(1, value / target));
}

export function goalProgress(goal: Goal, s: SeasonData): GoalProgress {
  const def = METRIC[goal.metric];
  let value: number | null = null;
  let recent: number | null = null;
  let sample = "";

  if (goal.metric === "att_pct") {
    value = goal.playerId ? s.attendancePct.get(goal.playerId) ?? null : null;
    sample = value === null ? "sem treinos" : "época";
  } else if (goal.metric === "wins") {
    value = s.record.w;
    sample = `${s.record.w}V ${s.record.l}D`;
  } else if (goal.metric === "opp_pts") {
    value = per(s.opp.pts, s.games.length);
    sample = `${s.games.length} jogos`;
    const last = s.games.slice(-3);
    recent = last.length ? last.reduce((a, g) => a + g.stats.opp.pts, 0) / last.length : null;
  } else if (goal.playerId) {
    const t = s.totals.get(goal.playerId);
    ({ value, sample } = t ? lineValue(goal.metric, t, t.gp) : { value: null, sample: "0 jogos" });
    const last = s.games.map((g) => g.stats.players.get(goal.playerId!)).filter((l): l is Line => !!l?.gp).slice(-3);
    if (last.length) {
      const sum = last.reduce((a, l) => { const x = { ...a }; (Object.keys(l) as (keyof Line)[]).forEach((k) => (x[k] += l[k])); return x; });
      recent = lineValue(goal.metric, sum, last.length).value;
    }
  } else {
    ({ value, sample } = lineValue(goal.metric, s.team, s.games.length));
    const last = s.games.slice(-3).map((g) => g.stats.us);
    if (last.length) {
      const sum = last.reduce((a, l) => { const x = { ...a }; (Object.keys(l) as (keyof Line)[]).forEach((k) => (x[k] += l[k])); return x; });
      recent = lineValue(goal.metric, sum, last.length).value;
    }
  }

  const ratio = ratioOf(value, goal.target, def?.lowerIsBetter);
  const reached = value !== null && (def?.lowerIsBetter ? value <= goal.target : value >= goal.target);
  return { value, recent, sample, ratio, reached };
}

export function fmtGoalValue(metric: GoalMetric, v: number | null) {
  if (v === null || !isFinite(v)) return "–";
  const def = METRIC[metric];
  if (def?.unit === "%") return `${v.toFixed(v % 1 ? 1 : 0)}%`;
  if (metric === "wins" || Number.isInteger(v)) return String(Math.round(v));
  return v.toFixed(1);
}

export function goalTitle(goal: Goal, playerName?: string) {
  if (goal.title) return goal.title;
  const def = METRIC[goal.metric];
  const who = playerName ?? "Equipa";
  const cmp = def?.lowerIsBetter ? "≤" : "≥";
  return `${who}: ${def?.label.replace(/ \(máx\.\)/, "") ?? goal.metric} ${cmp} ${fmtGoalValue(goal.metric, goal.target)}`;
}
