import type { SeasonData } from "./season";
import { addLines, emptyLine, reb, shotZones, tagStats, type Line, type TagAgg } from "./stats";
import { ZONES, type Zone } from "./court";
import { PLAY_TAGS, type Game, type Scouting } from "./types";

export interface ScoutReport {
  name: string;
  games: SeasonData["games"]; // played (with events)
  record: { w: number; l: number };
  their: Line; ours: Line; n: number;
  byPeriod: { us: number; opp: number }[];
  zones: { zone: Zone; share: number; pct: number | null; a: number }[];
  hurts: TagAgg[]; // play types they score with
  keys: string[]; // automatic keys to the game
  notes?: Scouting;
  next?: Game; // next game against them
}

const tagName = (id: string) => PLAY_TAGS.find((t) => t.id === id)?.label.toLowerCase() ?? id;
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
  const hurts = tagStats(events, "opp").tags.filter((t) => t.plays >= 3).sort((a, b) => b.pts - a.pts).slice(0, 3);

  const keys: string[] = [];
  if (n) {
    const per = (v: number) => v / n;
    const tr = hurts.find((t) => t.tag === "transicao");
    if (tr && tr.plays >= 5 && tr.pts / tr.plays >= 1.05) keys.push(`Voltar rápido na defesa: marcam ${(tr.pts / tr.plays).toFixed(2)} pts por jogada em transição.`);
    const threeShare = their.fga ? (their.p3a / their.fga) * 100 : 0;
    const p3 = their.p3a ? (their.p3m / their.p3a) * 100 : 0;
    if (threeShare >= 33 && p3 >= 28) keys.push(`Fechar os lançadores: ${Math.round(threeShare)}% dos lançamentos deles são triplos (${Math.round(p3)}%).`);
    const paint = zones.find((z) => z.zone === "Garrafão");
    if (paint && paint.share >= 45) keys.push(`Proteger o garrafão: ${paint.share}% dos lançamentos são perto do cesto${paint.pct !== null ? ` (${paint.pct}%)` : ""}.`);
    if (per(their.oreb) >= 9) keys.push(`Bloquear o ressalto: apanham ${per(their.oreb).toFixed(1)} ressaltos ofensivos por jogo.`);
    if (per(ours.tov) >= 14) keys.push(`Cuidar da bola: perdemos ${per(ours.tov).toFixed(1)} bolas por jogo contra eles.`);
    const ft = their.fta ? (their.ftm / their.fta) * 100 : null;
    if (ft !== null && their.fta >= 8 && ft < 55) keys.push(`Fazem só ${Math.round(ft)}% nos lances livres — pôr pressão no fim do jogo.`);
    const best = byPeriod.map((p, i) => ({ i, d: p.opp - p.us })).sort((a, b) => b.d - a.d)[0];
    if (best && best.d >= 3) keys.push(`Atenção ao ${best.i + 1}.º período: ganham-no em média por ${best.d.toFixed(1)}.`);
    const other = hurts.find((t) => t.tag !== "transicao" && t.plays >= 5 && t.pts / t.plays >= 1);
    if (other) keys.push(`Marcam bem em ${tagName(other.tag)} (${other.pts} pts em ${Math.round(other.plays)} jogadas).`);
    if (!keys.length) keys.push(`Contra eles marcamos ${per(ours.pts).toFixed(0)} e sofremos ${per(their.pts).toFixed(0)} em média — manter o nosso jogo.`);
  }

  const next = allGames
    .filter((g) => norm(g.opponent) === norm(name) && g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return { name, games, record: { w, l: n - w }, their, ours, n, byPeriod, zones, hurts, keys, notes, next };
}

export const avgReb = (l: Line, n: number) => (n ? reb(l) / n : 0);
