import type { Possession } from "./possessions";
import type { GameEvent, ID, Player } from "./types";
import { t } from "./i18n";

/* "What should I watch?" — the few moments of a game worth reviewing, found in the possessions:
   turnover streaks, runs, scoring droughts, second chances conceded, a five on court that sank,
   missed free throws late. Each one is a video window. */

export interface ReviewItem {
  tone: "bad" | "good";
  title: string;
  detail: string;
  period: number;
  from: number; // video seconds
  to: number;
  weight: number;
}

const PAD_BEFORE = 5;
const PAD_AFTER = 2;

export function reviewItems(poss: Possession[], events: GameEvent[], players: Player[], regulation = 4): ReviewItem[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const five = (ids: ID[]) => ids.map((id) => byId.get(id)?.number).filter((n) => n !== undefined).sort((a, b) => a! - b!).map((n) => `#${n}`).join(" ");
  const lateness = (period: number) => (period > regulation ? 1.5 : period === regulation ? 1.3 : 1);
  const win = (list: Possession[]) => ({ period: list[0].period, from: Math.max(0, list[0].start - PAD_BEFORE), to: list[list.length - 1].end + PAD_AFTER });
  const items: ReviewItem[] = [];
  const ours = poss.filter((p) => p.side === "us");
  const theirs = poss.filter((p) => p.side === "opp");

  // 1. turnover streaks: ≥3 turnovers in 4 of our possessions, or 2 in a row
  for (let i = 0; i < ours.length; i++) {
    const w = ours.slice(i, i + 4).filter((p) => p.period === ours[i].period);
    const tov = w.filter((p) => p.result === "tov");
    const two = ours[i].result === "tov" && ours[i + 1]?.result === "tov" && ours[i + 1].period === ours[i].period;
    if (tov.length >= 3 || two) {
      const span = tov.length >= 3 ? w.slice(0, w.lastIndexOf(tov[tov.length - 1]) + 1) : [ours[i], ours[i + 1]];
      const n = span.filter((p) => p.result === "tov").length;
      items.push({ tone: "bad", title: t("{n} perdas em {total} ataques", { n, total: span.length }), detail: t("Rever as decisões e a pressão do adversário."), ...win(span), weight: (n >= 3 ? n * 2.2 : 3) * lateness(span[0].period) });
      i += span.length - 1;
    }
  }

  // 2. runs (points unanswered)
  let run: { side: "us" | "opp"; pts: number; list: Possession[] } | null = null;
  const flush = () => {
    if (!run) return;
    if (run.side === "opp" && run.pts >= 7) items.push({ tone: "bad", title: t("Parcial de {n}–0 do adversário", { n: run.pts }), detail: t("{n} posses em que só eles marcaram.", { n: run.list.length }), ...win(run.list), weight: (run.pts / 1.6) * lateness(run.list[0].period) });
    if (run.side === "us" && run.pts >= 8) items.push({ tone: "good", title: t("Parcial de {n}–0 a nosso favor", { n: run.pts }), detail: t("O que funcionou — bom para mostrar à equipa."), ...win(run.list), weight: (run.pts / 2.4) * lateness(run.list[0].period) });
    run = null;
  };
  for (const p of poss) {
    if (run && p.period !== run.list[0].period) flush();
    if (p.pts > 0) {
      if (run && run.side === p.side) { run.pts += p.pts; run.list.push(p); }
      else { flush(); run = { side: p.side, pts: p.pts, list: [p] }; }
    } else if (run) run.list.push(p);
  }
  flush();

  // 3. scoring droughts: ≥6 of our possessions in a row without points
  let dry: Possession[] = [];
  const dryFlush = () => {
    if (dry.length >= 6) items.push({ tone: "bad", title: t("{n} ataques seguidos sem marcar", { n: dry.length }), detail: t("{tov} perdas e {miss} lançamentos falhados.", { tov: dry.filter((p) => p.result === "tov").length, miss: dry.filter((p) => p.result === "miss").length }), ...win(dry), weight: dry.length * 0.9 * lateness(dry[0].period) });
    dry = [];
  };
  for (const p of ours) {
    if (dry.length && p.period !== dry[0].period) dryFlush();
    if (p.pts === 0) dry.push(p); else dryFlush();
  }
  dryFlush();

  // 4. second chances conceded: several opponent offensive rebounds that turned into points
  const sc = theirs.filter((p) => p.secondChancePts > 0);
  for (let i = 0; i < sc.length; i++) {
    const group = [sc[i]];
    while (i + 1 < sc.length && sc[i + 1].period === sc[i].period && theirs.indexOf(sc[i + 1]) - theirs.indexOf(group[group.length - 1]) <= 5) group.push(sc[++i]);
    const pts = group.reduce((a, p) => a + p.secondChancePts, 0);
    if (pts >= 4) items.push({ tone: "bad", title: t("{n} pontos de 2.ª oportunidade sofridos", { n: pts }), detail: group.length > 1 ? t("{n} ressaltos ofensivos do adversário — rever o bloqueio de ressalto.", { n: group.length }) : t("{n} ressalto ofensivo do adversário — rever o bloqueio de ressalto.", { n: group.length }), ...win(group), weight: pts * 0.8 * lateness(group[0].period) });
  }

  // 5. a five on court that sank (−6 or worse in one stint)
  let stint: Possession[] = [];
  const key = (p: Possession) => [...p.lineup].sort().join("|");
  const stintFlush = () => {
    if (stint.length >= 3 && stint[0].lineup.length === 5) {
      const pf = stint.filter((p) => p.side === "us").reduce((a, p) => a + p.pts, 0);
      const pa = stint.filter((p) => p.side === "opp").reduce((a, p) => a + p.pts, 0);
      if (pf - pa <= -6) items.push({ tone: "bad", title: t("Quinteto {five}: {score}", { five: five(stint[0].lineup), score: `${pf}–${pa}` }), detail: t("{n} posses com este cinco em campo.", { n: stint.length }), ...win(stint), weight: (pa - pf) * 0.7 * lateness(stint[0].period) });
    }
    stint = [];
  };
  for (const p of poss) {
    if (stint.length && (key(p) !== key(stint[0]) || p.period !== stint[0].period)) stintFlush();
    stint.push(p);
  }
  stintFlush();

  // 6. free throws missed late
  const lastPeriod = Math.max(...events.map((e) => e.period), 0);
  const missedFt = events.filter((e) => e.side === "us" && e.type === "FT" && !e.meta?.made && e.period === lastPeriod && lastPeriod >= regulation);
  if (missedFt.length >= 3) {
    items.push({ tone: "bad", title: t("{n} lances livres falhados no fim", { n: missedFt.length }), detail: t("Pontos que ficaram na linha no último período."), period: lastPeriod, from: Math.max(0, missedFt[0].videoTs - PAD_BEFORE), to: missedFt[missedFt.length - 1].videoTs + PAD_AFTER, weight: missedFt.length * 1.2 });
  }

  // strongest first, drop overlapping windows, then back to game order
  const chosen: ReviewItem[] = [];
  for (const it of items.sort((a, b) => b.weight - a.weight)) {
    const overlaps = chosen.some((c) => Math.min(c.to, it.to) - Math.max(c.from, it.from) > 0.5 * Math.min(c.to - c.from, it.to - it.from));
    if (!overlaps) chosen.push(it);
    if (chosen.length >= 8) break;
  }
  return chosen.sort((a, b) => a.from - b.from);
}
