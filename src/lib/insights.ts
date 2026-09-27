import type { Game, GameEvent, ID, Player } from "./types";
import { eff, pointsOf, ppp, reb, sortEvents, tagStats, walk, type GameStats, type Line } from "./stats";
import { PLAY_TAGS } from "./types";
import { zoneOf } from "./court";
import { t } from "./i18n";

export interface Insight {
  tone: "good" | "bad" | "info";
  title: string;
  text: string;
  clips?: string; // query string for the logger playlist
}

const periodName = (p: number) => (p <= 4 ? t("{n}.º período", { n: p }) : t("prolongamento {n}", { n: p - 4 }));

/** Longest scoring run for each side (points scored while the other side scores 0). */
function runs(events: GameEvent[]) {
  let best = { side: "us" as "us" | "opp", pts: 0, against: 0, period: 1, from: 0 };
  let cur = { side: "us" as "us" | "opp", pts: 0, period: 1, from: 0 };
  for (const e of sortEvents(events)) {
    const p = pointsOf(e);
    if (!p) continue;
    if (e.side === cur.side) cur.pts += p;
    else cur = { side: e.side, pts: p, period: e.period, from: e.videoTs };
    if (cur.pts > best.pts) best = { ...cur, against: 0 };
  }
  return best;
}

export function gameInsights(
  game: Game,
  stats: GameStats,
  events: GameEvent[],
  players: Player[],
  seasonAvg?: Map<ID, Line & { games: number }>,
): Insight[] {
  const out: Insight[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const nm = (id: ID) => { const p = byId.get(id); return p ? `#${p.number} ${p.name.split(" ")[0]}` : "?"; };
  const { us, opp } = stats;
  const diff = us.pts - opp.pts;
  const clip = (q: Record<string, string>) => new URLSearchParams({ ...q, play: "1" }).toString();

  // 1. result + decisive period
  const periods = stats.byPeriod.map((p, i) => ({ i: i + 1, d: p.us - p.opp })).filter((p) => stats.byPeriod[p.i - 1].us + stats.byPeriod[p.i - 1].opp > 0);
  if (periods.length) {
    const worst = [...periods].sort((a, b) => a.d - b.d)[0];
    const best = [...periods].sort((a, b) => b.d - a.d)[0];
    if (diff >= 0 && best.d > 0) {
      out.push({ tone: "good", title: diff > 0 ? t("Vitória por {n}", { n: diff }) : t("Empate"), text: t("O jogo decidiu-se no {period}, ganho por {n} pontos ({score}).", { period: periodName(best.i), n: best.d, score: `${stats.byPeriod[best.i - 1].us}–${stats.byPeriod[best.i - 1].opp}` }) });
    } else if (diff < 0 && worst.d < 0) {
      out.push({ tone: "bad", title: t("Derrota por {n}", { n: -diff }), text: t("O {period} custou {n} pontos ({score}). Vale a pena rever esse período.", { period: periodName(worst.i), n: -worst.d, score: `${stats.byPeriod[worst.i - 1].us}–${stats.byPeriod[worst.i - 1].opp}` }) });
    }
  }

  // 2. biggest run
  const r = runs(events);
  if (r.pts >= 8) {
    out.push({
      tone: r.side === "us" ? "good" : "bad",
      title: r.side === "us" ? t("Parcial de {n}–0 a nosso favor", { n: r.pts }) : t("Parcial de {n}–0 do adversário", { n: r.pts }),
      text: `${t("No {period}.", { period: periodName(r.period) })} ${r.side === "us" ? t("Perceber o que funcionou para o repetir.") : t("Ver o que falhou (perdas, ressaltos, defesa em transição).")}`,
    });
  }

  // 3. turnovers
  if (us.tov - opp.tov >= 4) {
    out.push({ tone: "bad", title: t("{n} perdas de bola (adv. {opp})", { n: us.tov, opp: opp.tov }), text: t("Mais {n} posses entregues ao adversário.", { n: us.tov - opp.tov }), clips: clip({ lado: "us", tipo: "TOV" }) });
  } else if (opp.tov - us.tov >= 4) {
    out.push({ tone: "good", title: t("Forçámos {n} perdas (nós {us})", { n: opp.tov, us: us.tov }), text: t("A pressão defensiva deu {n} posses extra.", { n: opp.tov - us.tov }), clips: clip({ lado: "us", tipo: "STL" }) });
  }

  // 4. rebounding
  const rd = reb(us) - reb(opp);
  if (Math.abs(rd) >= 6) {
    out.push({
      tone: rd > 0 ? "good" : "bad",
      title: t("Ressaltos {score}", { score: `${reb(us)}–${reb(opp)}` }),
      text: rd > 0 ? t("Dominámos as tábuas (+{n}), com {oreb} ressaltos ofensivos.", { n: rd, oreb: us.oreb }) : t("O adversário ganhou {n} ressaltos a mais, {oreb} deles ofensivos — segundas oportunidades.", { n: -rd, oreb: opp.oreb }),
      clips: rd < 0 ? clip({ lado: "opp", tipo: "REB" }) : undefined,
    });
  }

  // 5. free throws
  if (us.fta >= 8 && us.ftm / us.fta < 0.6) {
    out.push({ tone: "bad", title: t("Lances livres {m}/{a} ({pct}%)", { m: us.ftm, a: us.fta, pct: Math.round((us.ftm / us.fta) * 100) }), text: t("Com 70% seriam mais {n} pontos.", { n: Math.round(us.fta * 0.7 - us.ftm) }), clips: clip({ lado: "us", tipo: "FT" }) });
  }

  // 6. shot profile
  const ourShots = events.filter((e) => e.side === "us" && e.type === "SHOT" && e.x !== undefined);
  if (ourShots.length >= 20) {
    const mid = ourShots.filter((e) => zoneOf(e.x!, e.y!) === "Média distância");
    const paint = ourShots.filter((e) => zoneOf(e.x!, e.y!) === "Garrafão");
    const paintPct = paint.length ? paint.filter((e) => e.meta?.made).length / paint.length : 0;
    if (mid.length / ourShots.length > 0.35) {
      out.push({ tone: "info", title: t("{pct}% dos lançamentos de média distância", { pct: Math.round((mid.length / ourShots.length) * 100) }), text: t("É o lançamento menos eficiente. No garrafão convertemos {pct}%.", { pct: Math.round(paintPct * 100) }) });
    }
  }

  // 7. players
  const lines = [...stats.players.entries()].filter(([id]) => byId.has(id));
  const top = [...lines].sort((a, b) => b[1].pts - a[1].pts)[0];
  if (top && top[1].pts > 0) {
    const avg = seasonAvg?.get(top[0]);
    const vs = avg && avg.games > 1 ? " " + t("(média da época {avg})", { avg: (avg.pts / avg.games).toFixed(1) }) : "";
    out.push({ tone: "info", title: t("Melhor marcador: {name} — {pts} pts", { name: nm(top[0]), pts: top[1].pts }), text: t("{m}/{a} de campo, {p3} triplos{vs}.", { m: top[1].fgm, a: top[1].fga, p3: top[1].p3m, vs }), clips: clip({ jogador: top[0], tipo: "SHOT" }) });
  }
  for (const [id, l] of lines) {
    const cats = [l.pts, reb(l), l.ast, l.stl, l.blk].filter((v) => v >= 10).length;
    if (cats >= 2) out.push({ tone: "good", title: t("Duplo-duplo de {name}", { name: nm(id) }), text: t("{pts} pts, {reb} ress., {ast} ast.", { pts: l.pts, reb: reb(l), ast: l.ast }) });
    const avg = seasonAvg?.get(id);
    if (avg && avg.games >= 3) {
      const e = eff(l), ae = eff(avg) / avg.games;
      if (e - ae >= 8) out.push({ tone: "good", title: t("{name} muito acima do habitual", { name: nm(id) }), text: t("Eficiência {e} vs {avg} de média.", { e, avg: ae.toFixed(1) }), clips: clip({ jogador: id }) });
      else if (ae - e >= 8 && ae >= 8) out.push({ tone: "bad", title: t("{name} abaixo do habitual", { name: nm(id) }), text: t("Eficiência {e} vs {avg} de média.", { e, avg: ae.toFixed(1) }), clips: clip({ jogador: id }) });
    }
    if (l.pf >= 4) out.push({ tone: "info", title: t("{name} com {n} faltas", { name: nm(id), n: l.pf }), text: l.pf >= 5 ? t("Foi excluído por faltas.") : t("Esteve em risco de exclusão."), clips: clip({ jogador: id, tipo: "FOUL" }) });
  }

  // 8. lineups
  const lus = [...stats.lineups.values()].filter((l) => l.events >= 15);
  if (lus.length >= 2) {
    const best = [...lus].sort((a, b) => b.pf - b.pa - (a.pf - a.pa))[0];
    const worst = [...lus].sort((a, b) => a.pf - a.pa - (b.pf - b.pa))[0];
    const label = (ids: ID[]) => ids.map((id) => byId.get(id)?.number).sort((a, b) => (a ?? 0) - (b ?? 0)).map((n) => `#${n}`).join(" ");
    if (best.pf - best.pa > 0) out.push({ tone: "good", title: t("Melhor quinteto: {five}", { five: label(best.ids) }), text: t("{diff} ({score}) em campo.", { diff: `+${best.pf - best.pa}`, score: `${best.pf}–${best.pa}` }) });
    if (worst !== best && worst.pf - worst.pa < 0) out.push({ tone: "bad", title: t("Quinteto a rever: {five}", { five: label(worst.ids) }), text: t("{diff} ({score}) em campo.", { diff: worst.pf - worst.pa, score: `${worst.pf}–${worst.pa}` }) });
  }

  // 9. play context (only when the analyst tagged enough plays)
  for (const side of ["us", "opp"] as const) {
    const ts = tagStats(events, side);
    if (ts.tagged < 8) continue;
    const big = ts.tags.filter((tg) => tg.plays >= 4);
    const label = (id: string) => { const x = PLAY_TAGS.find((tg) => tg.id === id)?.label; return x ? t(x).toLowerCase() : id; };
    if (side === "us") {
      const best = [...big].sort((a, b) => b.pts / b.plays - a.pts / a.plays)[0];
      const worst = [...big].sort((a, b) => a.pts / a.plays - b.pts / b.plays)[0];
      if (best && best.pts / best.plays >= 1.1) out.push({ tone: "good", title: t("Funcionou: {tag}", { tag: label(best.tag) }), text: t("{pts} pts em {n} jogadas ({ppp} por jogada).", { pts: best.pts, n: Math.round(best.plays), ppp: ppp(best) }), clips: clip({ lado: "us", contexto: best.tag }) });
      if (worst && worst !== best && worst.pts / worst.plays <= 0.7) out.push({ tone: "bad", title: t("Pouco eficaz: {tag}", { tag: label(worst.tag) }), text: worst.tov ? t("{pts} pts em {n} jogadas ({ppp} por jogada), {tov} perdas.", { pts: worst.pts, n: Math.round(worst.plays), ppp: ppp(worst), tov: worst.tov }) : t("{pts} pts em {n} jogadas ({ppp} por jogada).", { pts: worst.pts, n: Math.round(worst.plays), ppp: ppp(worst) }), clips: clip({ lado: "us", contexto: worst.tag }) });
    } else {
      const hurt = [...big].sort((a, b) => b.pts - a.pts)[0];
      if (hurt && hurt.pts >= 10) out.push({ tone: "bad", title: t("O adversário marcou em {tag}", { tag: label(hurt.tag) }), text: t("{pts} pts sofridos nesse tipo de jogada ({ppp} por jogada).", { pts: hurt.pts, ppp: ppp(hurt) }), clips: clip({ lado: "opp", contexto: hurt.tag }) });
    }
  }

  // 10. data quality
  const noLoc = events.filter((e) => e.side === "us" && e.type === "SHOT" && e.x === undefined).length;
  let hasLineup = false;
  walk(events, (_e, on) => { if (on.length) hasLineup = true; });
  if (!hasLineup) out.push({ tone: "info", title: t("Sem 5 inicial registado"), text: t("Sem ele não há +/-, minutos nem quintetos.") });
  else if (noLoc > 5) out.push({ tone: "info", title: t("{n} lançamentos sem local", { n: noLoc }), text: t("Marca o local no campo para o mapa de lançamentos ficar completo."), clips: clip({ lado: "us", tipo: "SHOT" }) });

  void game;
  return out;
}
