import type { Game, GameEvent, ID, Player } from "./types";
import { eff, pointsOf, ppp, reb, sortEvents, tagStats, walk, type GameStats, type Line } from "./stats";
import { PLAY_TAGS } from "./types";
import { zoneOf } from "./court";

export interface Insight {
  tone: "good" | "bad" | "info";
  title: string;
  text: string;
  clips?: string; // query string for the logger playlist
}

const ord = (n: number) => `${n}.º`;
const periodName = (p: number) => (p <= 4 ? `${ord(p)} período` : `prolongamento ${p - 4}`);

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
      out.push({ tone: "good", title: diff > 0 ? `Vitória por ${diff}` : "Empate", text: `O jogo decidiu-se no ${periodName(best.i)}, ganho por ${best.d} pontos (${stats.byPeriod[best.i - 1].us}–${stats.byPeriod[best.i - 1].opp}).` });
    } else if (diff < 0 && worst.d < 0) {
      out.push({ tone: "bad", title: `Derrota por ${-diff}`, text: `O ${periodName(worst.i)} custou ${-worst.d} pontos (${stats.byPeriod[worst.i - 1].us}–${stats.byPeriod[worst.i - 1].opp}). Vale a pena rever esse período.` });
    }
  }

  // 2. biggest run
  const r = runs(events);
  if (r.pts >= 8) {
    out.push({
      tone: r.side === "us" ? "good" : "bad",
      title: `Parcial de ${r.pts}–0 ${r.side === "us" ? "a nosso favor" : "do adversário"}`,
      text: `No ${periodName(r.period)}. ${r.side === "us" ? "Perceber o que funcionou para o repetir." : "Ver o que falhou (perdas, ressaltos, defesa em transição)."}`,
    });
  }

  // 3. turnovers
  if (us.tov - opp.tov >= 4) {
    out.push({ tone: "bad", title: `${us.tov} perdas de bola (adv. ${opp.tov})`, text: `Mais ${us.tov - opp.tov} posses entregues ao adversário.`, clips: clip({ lado: "us", tipo: "TOV" }) });
  } else if (opp.tov - us.tov >= 4) {
    out.push({ tone: "good", title: `Forçámos ${opp.tov} perdas (nós ${us.tov})`, text: `A pressão defensiva deu ${opp.tov - us.tov} posses extra.`, clips: clip({ lado: "us", tipo: "STL" }) });
  }

  // 4. rebounding
  const rd = reb(us) - reb(opp);
  if (Math.abs(rd) >= 6) {
    out.push({
      tone: rd > 0 ? "good" : "bad",
      title: `Ressaltos ${reb(us)}–${reb(opp)}`,
      text: rd > 0 ? `Dominámos as tábuas (+${rd}), com ${us.oreb} ressaltos ofensivos.` : `O adversário ganhou ${-rd} ressaltos a mais, ${opp.oreb} deles ofensivos — segundas oportunidades.`,
      clips: rd < 0 ? clip({ lado: "opp", tipo: "REB" }) : undefined,
    });
  }

  // 5. free throws
  if (us.fta >= 8 && us.ftm / us.fta < 0.6) {
    out.push({ tone: "bad", title: `Lances livres ${us.ftm}/${us.fta} (${Math.round((us.ftm / us.fta) * 100)}%)`, text: `Com 70% seriam mais ${Math.round(us.fta * 0.7 - us.ftm)} pontos.`, clips: clip({ lado: "us", tipo: "FT" }) });
  }

  // 6. shot profile
  const ourShots = events.filter((e) => e.side === "us" && e.type === "SHOT" && e.x !== undefined);
  if (ourShots.length >= 20) {
    const mid = ourShots.filter((e) => zoneOf(e.x!, e.y!) === "Média distância");
    const paint = ourShots.filter((e) => zoneOf(e.x!, e.y!) === "Garrafão");
    const paintPct = paint.length ? paint.filter((e) => e.meta?.made).length / paint.length : 0;
    if (mid.length / ourShots.length > 0.35) {
      out.push({ tone: "info", title: `${Math.round((mid.length / ourShots.length) * 100)}% dos lançamentos de média distância`, text: `É o lançamento menos eficiente. No garrafão convertemos ${Math.round(paintPct * 100)}%.` });
    }
  }

  // 7. players
  const lines = [...stats.players.entries()].filter(([id]) => byId.has(id));
  const top = [...lines].sort((a, b) => b[1].pts - a[1].pts)[0];
  if (top && top[1].pts > 0) {
    const avg = seasonAvg?.get(top[0]);
    const vs = avg && avg.games > 1 ? ` (média da época ${(avg.pts / avg.games).toFixed(1)})` : "";
    out.push({ tone: "info", title: `Melhor marcador: ${nm(top[0])} — ${top[1].pts} pts`, text: `${top[1].fgm}/${top[1].fga} de campo, ${top[1].p3m} triplos${vs}.`, clips: clip({ jogador: top[0], tipo: "SHOT" }) });
  }
  for (const [id, l] of lines) {
    const cats = [l.pts, reb(l), l.ast, l.stl, l.blk].filter((v) => v >= 10).length;
    if (cats >= 2) out.push({ tone: "good", title: `Duplo-duplo de ${nm(id)}`, text: `${l.pts} pts, ${reb(l)} ress., ${l.ast} ast.` });
    const avg = seasonAvg?.get(id);
    if (avg && avg.games >= 3) {
      const e = eff(l), ae = eff(avg) / avg.games;
      if (e - ae >= 8) out.push({ tone: "good", title: `${nm(id)} muito acima do habitual`, text: `Eficiência ${e} vs ${ae.toFixed(1)} de média.`, clips: clip({ jogador: id }) });
      else if (ae - e >= 8 && ae >= 8) out.push({ tone: "bad", title: `${nm(id)} abaixo do habitual`, text: `Eficiência ${e} vs ${ae.toFixed(1)} de média.`, clips: clip({ jogador: id }) });
    }
    if (l.pf >= 4) out.push({ tone: "info", title: `${nm(id)} com ${l.pf} faltas`, text: l.pf >= 5 ? "Foi excluído por faltas." : "Esteve em risco de exclusão.", clips: clip({ jogador: id, tipo: "FOUL" }) });
  }

  // 8. lineups
  const lus = [...stats.lineups.values()].filter((l) => l.events >= 15);
  if (lus.length >= 2) {
    const best = [...lus].sort((a, b) => b.pf - b.pa - (a.pf - a.pa))[0];
    const worst = [...lus].sort((a, b) => a.pf - a.pa - (b.pf - b.pa))[0];
    const label = (ids: ID[]) => ids.map((id) => byId.get(id)?.number).sort((a, b) => (a ?? 0) - (b ?? 0)).map((n) => `#${n}`).join(" ");
    if (best.pf - best.pa > 0) out.push({ tone: "good", title: `Melhor quinteto: ${label(best.ids)}`, text: `+${best.pf - best.pa} (${best.pf}–${best.pa}) em campo.` });
    if (worst !== best && worst.pf - worst.pa < 0) out.push({ tone: "bad", title: `Quinteto a rever: ${label(worst.ids)}`, text: `${worst.pf - worst.pa} (${worst.pf}–${worst.pa}) em campo.` });
  }

  // 9. play context (only when the analyst tagged enough plays)
  for (const side of ["us", "opp"] as const) {
    const ts = tagStats(events, side);
    if (ts.tagged < 8) continue;
    const big = ts.tags.filter((t) => t.plays >= 4);
    const label = (id: string) => PLAY_TAGS.find((t) => t.id === id)?.label.toLowerCase() ?? id;
    if (side === "us") {
      const best = [...big].sort((a, b) => b.pts / b.plays - a.pts / a.plays)[0];
      const worst = [...big].sort((a, b) => a.pts / a.plays - b.pts / b.plays)[0];
      if (best && best.pts / best.plays >= 1.1) out.push({ tone: "good", title: `Funcionou: ${label(best.tag)}`, text: `${best.pts} pts em ${Math.round(best.plays)} jogadas (${ppp(best)} por jogada).`, clips: clip({ lado: "us", contexto: best.tag }) });
      if (worst && worst !== best && worst.pts / worst.plays <= 0.7) out.push({ tone: "bad", title: `Pouco eficaz: ${label(worst.tag)}`, text: `${worst.pts} pts em ${Math.round(worst.plays)} jogadas (${ppp(worst)} por jogada)${worst.tov ? `, ${worst.tov} perdas` : ""}.`, clips: clip({ lado: "us", contexto: worst.tag }) });
    } else {
      const hurt = [...big].sort((a, b) => b.pts - a.pts)[0];
      if (hurt && hurt.pts >= 10) out.push({ tone: "bad", title: `O adversário marcou em ${label(hurt.tag)}`, text: `${hurt.pts} pts sofridos nesse tipo de jogada (${ppp(hurt)} por jogada).`, clips: clip({ lado: "opp", contexto: hurt.tag }) });
    }
  }

  // 10. data quality
  const noLoc = events.filter((e) => e.side === "us" && e.type === "SHOT" && e.x === undefined).length;
  let hasLineup = false;
  walk(events, (_e, on) => { if (on.length) hasLineup = true; });
  if (!hasLineup) out.push({ tone: "info", title: "Sem 5 inicial registado", text: "Sem ele não há +/-, minutos nem quintetos." });
  else if (noLoc > 5) out.push({ tone: "info", title: `${noLoc} lançamentos sem local`, text: "Marca o local no campo para o mapa de lançamentos ficar completo.", clips: clip({ lado: "us", tipo: "SHOT" }) });

  void game;
  return out;
}
