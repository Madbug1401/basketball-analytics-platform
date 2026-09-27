import type { SeasonData } from "./season";
import { addLines, emptyLine, reb, shotZones, tagStats, type Line, type TagAgg } from "./stats";
import { ZONES, type Zone } from "./court";
import { PLAY_TAGS, type Game, type Scouting } from "./types";
import { t } from "./i18n";

export interface ScoutReport {
  name: string;
  games: SeasonData["games"]; // played (with events)
  record: { w: number; l: number };
  their: Line; ours: Line; n: number;
  byPeriod: { us: number; opp: number }[];
  zones: { zone: Zone; share: number; pct: number | null; a: number }[];
  hurts: TagAgg[]; // play types they score with
  keys: string[]; // automatic keys to the game (text in the current language)
  keyIds: string[]; // language-independent id of each key (same order), used by the game-plan suggestions
  notes?: Scouting;
  next?: Game; // next game against them
}

const tagName = (id: string) => { const label = PLAY_TAGS.find((pt) => pt.id === id)?.label; return label ? t(label).toLowerCase() : id; };
const norm = (s: string) => s.trim().toLowerCase();

export function scoutReport(name: string, s: SeasonData, allGames: Game[], notes?: Scouting, today = new Date().toISOString().slice(0, 10)): ScoutReport {
  const games = s.games.filter((g) => norm(g.game.opponent) === norm(name));
  const n = games.length;
  const their = games.reduce((acc, g) => addLines(acc, { ...g.stats.opp }), emptyLine());
  const ours = games.reduce((acc, g) => addLines(acc, { ...g.stats.us }), emptyLine());
  const w = games.filter((g) => g.stats.us.pts > g.stats.opp.pts).length;
  const byPeriod = [0, 1, 2, 3].map((i) => ({
    us: n ? games.reduce((a, g) => a + (g.stats.byPeriod[i]?.us ?? 0), 0) / n : 0,
    opp: n ? games.reduce((a, g) => a + (g.stats.byPeriod[i]?.opp ?? 0), 0) / n : 0,
  }));
  const events = games.flatMap((g) => g.events);
  const shots = events.filter((e) => e.side === "opp" && e.type === "SHOT" && e.x !== undefined);
  const zs = shotZones(shots);
  const zones = ZONES.map((z) => {
    const a = zs.find((x) => x.zone === z);
    return { zone: z, a: a?.a ?? 0, share: shots.length ? Math.round(((a?.a ?? 0) / shots.length) * 100) : 0, pct: a?.a ? Math.round((a.m / a.a) * 100) : null };
  });
  const hurts = tagStats(events, "opp").tags.filter((tg) => tg.plays >= 3).sort((a, b) => b.pts - a.pts).slice(0, 3);

  const keys: string[] = [];
  const keyIds: string[] = [];
  const key = (id: string, text: string) => { keyIds.push(id); keys.push(text); };
  if (n) {
    const per = (v: number) => v / n;
    const tr = hurts.find((tg) => tg.tag === "transicao");
    if (tr && tr.plays >= 5 && tr.pts / tr.plays >= 1.05) key("transicao", t("Voltar rápido na defesa: marcam {v} pts por jogada em transição.", { v: (tr.pts / tr.plays).toFixed(2) }));
    const threeShare = their.fga ? (their.p3a / their.fga) * 100 : 0;
    const p3 = their.p3a ? (their.p3m / their.p3a) * 100 : 0;
    if (threeShare >= 33 && p3 >= 28) key("lancadores", t("Fechar os lançadores: {share}% dos lançamentos deles são triplos ({pct}%).", { share: Math.round(threeShare), pct: Math.round(p3) }));
    const paint = zones.find((z) => z.zone === "Garrafão");
    if (paint && paint.share >= 45) key("garrafao", paint.pct !== null ? t("Proteger o garrafão: {share}% dos lançamentos são perto do cesto ({pct}%).", { share: paint.share, pct: paint.pct }) : t("Proteger o garrafão: {share}% dos lançamentos são perto do cesto.", { share: paint.share }));
    if (per(their.oreb) >= 9) key("ressalto", t("Bloquear o ressalto: apanham {v} ressaltos ofensivos por jogo.", { v: per(their.oreb).toFixed(1) }));
    if (per(ours.tov) >= 14) key("perdas", t("Cuidar da bola: perdemos {v} bolas por jogo contra eles.", { v: per(ours.tov).toFixed(1) }));
    const ft = their.fta ? (their.ftm / their.fta) * 100 : null;
    if (ft !== null && their.fta >= 8 && ft < 55) key("lances_livres", t("Fazem só {pct}% nos lances livres — pôr pressão no fim do jogo.", { pct: Math.round(ft) }));
    const best = byPeriod.map((p, i) => ({ i, d: p.opp - p.us })).sort((a, b) => b.d - a.d)[0];
    if (best && best.d >= 3) key("periodo", t("Atenção ao {p}.º período: ganham-no em média por {v}.", { p: best.i + 1, v: best.d.toFixed(1) }));
    const other = hurts.find((tg) => tg.tag !== "transicao" && tg.plays >= 5 && tg.pts / tg.plays >= 1);
    if (other) key(`tag:${other.tag}`, t("Marcam bem em {tag} ({pts} pts em {plays} jogadas).", { tag: tagName(other.tag), pts: other.pts, plays: Math.round(other.plays) }));
    if (!keys.length) key("geral", t("Contra eles marcamos {pf} e sofremos {pa} em média — manter o nosso jogo.", { pf: per(ours.pts).toFixed(0), pa: per(their.pts).toFixed(0) }));
  }

  const next = allGames
    .filter((g) => norm(g.opponent) === norm(name) && g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return { name, games, record: { w, l: n - w }, their, ours, n, byPeriod, zones, hurts, keys, keyIds, notes, next };
}

export const avgReb = (l: Line, n: number) => (n ? reb(l) / n : 0);
