import type { SeasonData } from "./season";
import { reb, tagStats } from "./stats";
import type { Agenda, Drill, DrillFocus, GameEvent } from "./types";
import { t } from "./i18n";

/** Starter drill library (the coach can edit, delete or add their own). */
export const BASE_DRILLS: Omit<Drill, "id" | "teamId" | "createdAt">[] = [
  { name: "Lançamento em 5 posições", focus: ["lancamento"], minutes: 12, description: "Pares, 1 bola. 5 lançamentos por posição (cantos, 45º, frente), troca ao fim de cada posição. Contar convertidos." },
  { name: "Lances livres com fadiga", focus: ["ll"], minutes: 10, description: "Sprint campo inteiro e 2 lances livres. Objetivo por série (ex.: 7/10). Simula o fim de jogo." },
  { name: "Mikan e finalizações", focus: ["lancamento"], minutes: 6, description: "Mikan, reverse, finalização com a mão fraca. 30 segundos por variante." },
  { name: "3x2 / 2x1 contínuo", focus: ["transicao"], minutes: 12, description: "3 atacam contra 2; quem defende e ganha a bola sai em 2x1 para o outro lado." },
  { name: "Regresso defensivo ao sprint", focus: ["transicao", "defesa"], minutes: 8, description: "Após lançamento, a equipa que atacou tem de ter 3 jogadores atrás da linha da bola em 3 segundos." },
  { name: "Box-out 1x1 e 3x3", focus: ["ressalto"], minutes: 10, description: "Treinador lança; quem defende faz bloqueio de ressalto. Ponto para quem ganhar o ressalto." },
  { name: "Passe em estrela", focus: ["passe"], minutes: 8, description: "5 filas em estrela, passe e segue. Variar tipo de passe e mão." },
  { name: "Ataque contra pressão (4x4 + 1)", focus: ["pressao", "tov"], minutes: 12, description: "Saída de bola contra pressão a campo inteiro. Regras: sem driblar para o canto, apoio ao portador, passe por cima da pressão." },
  { name: "Ataque à zona 2-3", focus: ["zona"], minutes: 12, description: "Circulação rápida, jogador no poste alto, overload num lado e lançamento dos cantos." },
  { name: "Pick & roll 2x2 — leituras", focus: ["pnr"], minutes: 12, description: "Portador lê o defesa do bloqueador: lançamento, penetração ou passe ao rolante." },
  { name: "Defesa do pick & roll", focus: ["pnr", "defesa"], minutes: 10, description: "Treinar a regra da equipa (hedge, drop ou troca) e a ajuda do lado fraco." },
  { name: "Shell drill 4x4", focus: ["defesa"], minutes: 12, description: "Posições de ajuda e recuperação com a bola a circular. Depois com penetrações." },
  { name: "Passa e corta a 2 toques", focus: ["tov", "passe"], minutes: 8, description: "5x0 / 5x5 com máximo de 2 dribles por posse. Menos drible, menos perdas." },
  { name: "5x5 com regras", focus: ["tatica"], minutes: 15, description: "Jogo com pontos extra para o que se quer treinar (ressalto ofensivo, 3 passes antes de lançar…)." },
  { name: "Circuito de agilidade e deslocamentos", focus: ["fisico", "defesa"], minutes: 10, description: "Escada, cones, deslocamentos defensivos laterais e sprints curtos." },
  { name: "Sistemas de ataque (walk-through)", focus: ["tatica"], minutes: 10, description: "Rever as jogadas da equipa a meio-gás, depois 5x0 a ritmo de jogo." },
];

export interface Suggestion { focus: DrillFocus; reason: string }

/** Areas to work on, from the season numbers. */
export function suggestions(s: SeasonData): Suggestion[] {
  const out: Suggestion[] = [];
  const n = s.games.length;
  if (!n) return out;
  const per = (v: number) => v / n;
  const pct = (m: number, a: number) => (a ? (m / a) * 100 : null);
  const events: GameEvent[] = s.games.flatMap((g) => g.events);
  const us = tagStats(events, "us").tags;
  const opp = tagStats(events, "opp").tags;
  const ppp = (list: typeof us, tag: string) => { const ts = list.find((x) => x.tag === tag); return ts && ts.plays >= 6 ? ts.pts / ts.plays : null; };

  if (per(s.team.tov) >= 14) out.push({ focus: "tov", reason: t("{n} perdas de bola por jogo", { n: per(s.team.tov).toFixed(1) }) });
  const press = us.find((t) => t.tag === "pressao");
  if ((press && press.tov >= 5) || (ppp(us, "pressao") ?? 1) < 0.75) out.push({ focus: "pressao", reason: press ? t("{tov} perdas e {ppp} pts/jogada contra pressão", { tov: press.tov, ppp: (press.plays ? press.pts / press.plays : 0).toFixed(2) }) : t("dificuldades contra pressão") });
  const ft = pct(s.team.ftm, s.team.fta);
  if (ft !== null && ft < 60) out.push({ focus: "ll", reason: t("{pct}% nos lances livres", { pct: ft.toFixed(0) }) });
  const fg = pct(s.team.fgm, s.team.fga);
  if (fg !== null && fg < 38) out.push({ focus: "lancamento", reason: t("{pct}% de lançamentos de campo", { pct: fg.toFixed(0) }) });
  if (per(s.opp.oreb) >= 10 || per(reb(s.team) - reb(s.opp)) <= -3) out.push({ focus: "ressalto", reason: t("o adversário apanha {n} ressaltos ofensivos por jogo", { n: per(s.opp.oreb).toFixed(1) }) });
  const oppFg = pct(s.opp.fgm, s.opp.fga);
  if (per(s.opp.pts) > per(s.team.pts) || (oppFg ?? 0) > 42) out.push({ focus: "defesa", reason: oppFg ? t("sofremos {n} pontos por jogo ({pct}% LC)", { n: per(s.opp.pts).toFixed(1), pct: oppFg.toFixed(0) }) : t("sofremos {n} pontos por jogo", { n: per(s.opp.pts).toFixed(1) }) });
  const oppTr = ppp(opp, "transicao");
  if (oppTr !== null && oppTr >= 1.1) out.push({ focus: "transicao", reason: t("o adversário marca {ppp} pts/jogada em transição", { ppp: oppTr.toFixed(2) }) });
  const zone = ppp(us, "zona");
  if (zone !== null && zone < 0.8) out.push({ focus: "zona", reason: t("só {ppp} pts/jogada contra zona", { ppp: zone.toFixed(2) }) });
  const oppPnr = ppp(opp, "pnr");
  if (oppPnr !== null && oppPnr >= 1.1) out.push({ focus: "pnr", reason: t("o adversário marca {ppp} pts/jogada em pick & roll", { ppp: oppPnr.toFixed(2) }) });
  return out;
}

/** Minutes spent per area in the planned practices. */
export function timeByFocus(agenda: Agenda[]) {
  const m = new Map<DrillFocus, number>();
  let total = 0;
  for (const a of agenda) {
    for (const it of a.plan ?? []) {
      total += it.minutes;
      const f = it.focus?.length ? it.focus : [];
      f.forEach((x) => m.set(x, (m.get(x) ?? 0) + it.minutes / f.length));
    }
  }
  return { byFocus: [...m.entries()].sort((a, b) => b[1] - a[1]), total };
}
