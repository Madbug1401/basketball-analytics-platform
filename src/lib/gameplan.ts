import { possessions, profile } from "./possessions";
import { pointsOf } from "./stats";
import type { Agenda, GameEvent, ID } from "./types";
import { L, t } from "./i18n";

/* Game plan: goals for one game, set before it (from the scouting) and checked after it.
   Stored in the game's agenda row (`plan` column), so it syncs and players can read it. */

export type PlanArea = "defesa" | "ataque" | "geral";
export type PlanMetric =
  | "opp_pts" | "opp_transition_pts" | "opp_oreb" | "opp_3pm" | "opp_second_pts" | "opp_ppp"
  | "our_tov" | "our_ppp" | "our_fta" | "our_oreb" | "our_transition_pts" | "our_ast";

export interface GamePlanItem {
  id: ID;
  area: PlanArea;
  text: string;
  check?: { metric: PlanMetric; op: "lte" | "gte"; value: number };
  result?: "ok" | "partial" | "fail"; // manual verdict (items without an automatic check)
}

export const AREA_LABEL: Record<PlanArea, string> = { defesa: L("Defesa"), ataque: L("Ataque"), geral: L("Geral") };
export const areaLabel = (a: PlanArea) => { const label = AREA_LABEL[a]; return t(label); };

export const METRICS: Record<PlanMetric, { label: string; op: "lte" | "gte"; area: PlanArea; suggest: number; text: string }> = {
  opp_pts: { label: L("Pontos sofridos"), op: "lte", area: "defesa", suggest: 55, text: L("Sofrer no máximo {v} pontos") },
  opp_transition_pts: { label: L("Pontos sofridos em transição"), op: "lte", area: "defesa", suggest: 8, text: L("Não deixar correr: máx. {v} pts em transição") },
  opp_oreb: { label: L("Ressaltos ofensivos do adversário"), op: "lte", area: "defesa", suggest: 8, text: L("Bloquear o ressalto: máx. {v} ressaltos ofensivos deles") },
  opp_3pm: { label: L("Triplos convertidos pelo adversário"), op: "lte", area: "defesa", suggest: 5, text: L("Fechar os lançadores: máx. {v} triplos deles") },
  opp_second_pts: { label: L("Pontos de 2.ª oportunidade sofridos"), op: "lte", area: "defesa", suggest: 6, text: L("Máx. {v} pontos de 2.ª oportunidade") },
  opp_ppp: { label: L("Pontos por posse do adversário"), op: "lte", area: "defesa", suggest: 0.9, text: L("Defesa: máx. {v} pontos por posse") },
  our_tov: { label: L("Perdas de bola (nós)"), op: "lte", area: "ataque", suggest: 12, text: L("Cuidar da bola: máx. {v} perdas") },
  our_ppp: { label: L("Pontos por posse (nós)"), op: "gte", area: "ataque", suggest: 1, text: L("Ataque: pelo menos {v} pontos por posse") },
  our_fta: { label: L("Lances livres tentados (nós)"), op: "gte", area: "ataque", suggest: 15, text: L("Atacar o cesto: pelo menos {v} lances livres") },
  our_oreb: { label: L("Ressaltos ofensivos (nós)"), op: "gte", area: "ataque", suggest: 10, text: L("Ir ao ressalto: pelo menos {v} ressaltos ofensivos") },
  our_transition_pts: { label: L("Pontos em transição (nós)"), op: "gte", area: "ataque", suggest: 10, text: L("Correr: pelo menos {v} pontos em transição") },
  our_ast: { label: L("Assistências (nós)"), op: "gte", area: "ataque", suggest: 12, text: L("Partilhar a bola: pelo menos {v} assistências") },
};

/** The metric's objective sentence with a value (in the current language). */
export const metricText = (m: PlanMetric, v: number | string) => { const text = METRICS[m].text; return t(text, { v }); };
export const metricLabel = (m: PlanMetric) => { const label = METRICS[m].label; return t(label); };

export const readPlan = (a?: Agenda): GamePlanItem[] => (a?.kind === "game" ? ((a.plan as unknown as GamePlanItem[]) ?? []) : []);

export function planPatch(items: GamePlanItem[]): Partial<Agenda> {
  return { plan: items as unknown as Agenda["plan"] };
}

export function metricValue(metric: PlanMetric, events: GameEvent[]): number | null {
  if (!events.length) return null;
  const poss = possessions(events);
  const us = profile(events, poss, "us"), opp = profile(events, poss, "opp");
  const count = (side: "us" | "opp", f: (e: GameEvent) => boolean) => events.filter((e) => e.side === side && f(e)).length;
  switch (metric) {
    case "opp_pts": return events.filter((e) => e.side === "opp").reduce((a, e) => a + pointsOf(e), 0);
    case "opp_transition_pts": return opp.transition.pts;
    case "opp_oreb": return count("opp", (e) => e.type === "REB" && !!e.meta?.off);
    case "opp_3pm": return count("opp", (e) => e.type === "SHOT" && e.meta?.pts === 3 && !!e.meta.made);
    case "opp_second_pts": return opp.secondChancePts;
    case "opp_ppp": return opp.ppp;
    case "our_tov": return count("us", (e) => e.type === "TOV");
    case "our_ppp": return us.ppp;
    case "our_fta": return count("us", (e) => e.type === "FT");
    case "our_oreb": return count("us", (e) => e.type === "REB" && !!e.meta?.off);
    case "our_transition_pts": return us.transition.pts;
    case "our_ast": return count("us", (e) => e.type === "AST");
  }
}

export interface Verdict { status: "ok" | "partial" | "fail" | "pending"; value?: number | null; auto: boolean }

export function verdict(item: GamePlanItem, events: GameEvent[]): Verdict {
  if (!item.check) return { status: item.result ?? "pending", auto: false };
  const v = metricValue(item.check.metric, events);
  if (v === null) return { status: "pending", auto: true, value: v };
  const target = item.check.value;
  const met = item.check.op === "lte" ? v <= target : v >= target;
  if (met) return { status: "ok", value: v, auto: true };
  const margin = Math.max(Math.abs(target) * 0.15, target < 3 ? 0.05 : 1);
  const close = item.check.op === "lte" ? v <= target + margin : v >= target - margin;
  return { status: close ? "partial" : "fail", value: v, auto: true };
}

export const fmtMetric = (m: PlanMetric, v: number | null | undefined) =>
  v === null || v === undefined ? "–" : m.endsWith("ppp") ? v.toFixed(2) : String(Math.round(v));

/** Suggested plan items from the scouting keys of this opponent (ScoutReport.keyIds, language-independent). */
export function suggestFromKeys(keyIds: string[]): PlanMetric[] {
  const out: PlanMetric[] = [];
  const has = (id: string) => keyIds.includes(id);
  if (has("transicao")) out.push("opp_transition_pts");
  if (has("ressalto") || has("tag:segunda")) out.push("opp_oreb");
  if (has("lancadores")) out.push("opp_3pm");
  if (has("perdas")) out.push("our_tov");
  return out;
}
