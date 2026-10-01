// Gera uma época fictícia completa (plantel, treinos, presenças, jogos com eventos)
// no formato de "Definições → Importar".
//
//   node scripts/gerar-dados-teste.mjs [ficheiro] [seed] [hoje AAAA-MM-DD]
//   ex.: node scripts/gerar-dados-teste.mjs dados-teste/abc-sub16-demo.json 2026 2026-09-27   (← o ficheiro de demonstração)
//
// Os 10 jogos são nos 10 sábados antes de "hoje"; a agenda tem os próximos jogos e treinos.
//
// Determinístico: a mesma seed gera sempre os mesmos dados.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = process.argv[2] ?? "dados-teste/abc-sub16-demo.json";
let seed = Number(process.argv[3] ?? 2026);
const TODAY = process.argv[4] ?? new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// last Saturday strictly before today
let LAST_SAT = addDays(TODAY, -1);
while (new Date(LAST_SAT + "T12:00:00Z").getUTCDay() !== 6) LAST_SAT = addDays(LAST_SAT, -1);
const FIRST_SAT = addDays(LAST_SAT, -63);

// ---------- PRNG ----------
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const chance = (p) => rnd() < p;
// contexto das jogadas (etiquetas): o analista marca ~55% das jogadas
const TAGS = [["transicao", 0.22], ["pnr", 0.24], ["iso", 0.16], ["poste", 0.1], ["bloqueio", 0.12], ["zona", 0.1], ["pressao", 0.06]];
const TAG_BONUS = { transicao: 0.12, pnr: 0.03, iso: -0.07, poste: 0.02, bloqueio: 0.04, zona: -0.05, pressao: -0.08, segunda: 0.06 };
function playTag(attempt) {
  if (!chance(0.55)) return null;
  if (attempt > 0) return "segunda";
  let x = rnd();
  for (const [t, w] of TAGS) { if ((x -= w) <= 0) return t; }
  return "pnr";
}
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pickW = (items, w) => {
  const tot = items.reduce((s, it) => s + w(it), 0);
  let r = rnd() * tot;
  for (const it of items) { r -= w(it); if (r <= 0) return it; }
  return items[items.length - 1];
};
const uuid = () => {
  const h = () => Math.floor(rnd() * 16).toString(16);
  const s = Array.from({ length: 32 }, h).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
};
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- equipa ----------
const teamId = uuid();
const created = Date.parse(addDays(FIRST_SAT, -30) + "T10:00:00Z");
const team = { id: teamId, name: "ABC", category: "Sub-16", gender: "M", season: "2026/27", createdAt: created };

// usage = peso ofensivo, p2/p3/ft = % base, r3 = % dos lançamentos que são triplos,
// reb/ast/stl/blk/tov/foul = pesos, att = assiduidade, grow = evolução ao longo da época
const ROSTER = [
  ["Kelvin Tavares", 4, "PG", 2010, 172, { usage: 1.3, p2: .46, p3: .31, ft: .72, r3: .35, reb: .6, ast: 2.4, stl: 1.8, blk: .2, tov: 1.6, foul: 1.0, att: .95, grow: 0 }],
  ["Djoy Semedo", 7, "SG", 2010, 178, { usage: 1.2, p2: .44, p3: .27, ft: .70, r3: .45, reb: .8, ast: 1.2, stl: 1.2, blk: .3, tov: 1.0, foul: .9, att: .9, grow: .12 }],
  ["Ailton Lopes", 8, "SF", 2010, 183, { usage: 1.0, p2: .48, p3: .30, ft: .66, r3: .25, reb: 1.2, ast: 1.0, stl: 1.0, blk: .6, tov: .9, foul: 1.1, att: .92, grow: .03 }],
  ["Hélder Varela", 10, "PF", 2010, 189, { usage: 1.0, p2: .52, p3: .20, ft: .58, r3: .05, reb: 2.0, ast: .6, stl: .6, blk: 1.4, tov: .9, foul: 1.4, att: .88, grow: .05 }],
  ["Edson Monteiro", 12, "C", 2011, 194, { usage: .9, p2: .55, p3: 0, ft: .52, r3: 0, reb: 2.4, ast: .5, stl: .4, blk: 2.2, tov: 1.0, foul: 1.6, att: .85, grow: .08 }],
  ["Nilton Gomes", 5, "PG", 2011, 168, { usage: .8, p2: .40, p3: .28, ft: .74, r3: .40, reb: .5, ast: 1.8, stl: 1.4, blk: .1, tov: 1.4, foul: 1.0, att: .97, grow: .06 }],
  ["Wilson Fortes", 9, "SG", 2010, 176, { usage: .8, p2: .42, p3: .33, ft: .78, r3: .55, reb: .6, ast: .8, stl: .9, blk: .2, tov: .7, foul: .8, att: .7, grow: 0 }],
  ["Dany Cabral", 11, "SF", 2011, 181, { usage: .7, p2: .43, p3: .25, ft: .62, r3: .20, reb: 1.1, ast: .7, stl: 1.1, blk: .5, tov: .9, foul: 1.2, att: .9, grow: .04 }],
  ["Rúben Sanches", 14, "PF", 2011, 187, { usage: .6, p2: .47, p3: .15, ft: .55, r3: .05, reb: 1.7, ast: .4, stl: .5, blk: 1.0, tov: .8, foul: 1.5, att: .8, grow: .02 }],
  ["Jair Mendes", 15, "C", 2011, 191, { usage: .5, p2: .50, p3: 0, ft: .50, r3: 0, reb: 1.9, ast: .3, stl: .3, blk: 1.5, tov: .9, foul: 1.7, att: .75, grow: 0 }],
  ["Paulo Brito", 6, "SG", 2011, 173, { usage: .5, p2: .38, p3: .24, ft: .65, r3: .35, reb: .5, ast: .9, stl: .8, blk: .1, tov: 1.1, foul: .9, att: .6, grow: 0 }],
  ["Lucas Rodrigues", 13, "SF", 2011, 179, { usage: .5, p2: .41, p3: .22, ft: .60, r3: .25, reb: .9, ast: .6, stl: .7, blk: .3, tov: 1.0, foul: 1.0, att: .93, grow: .05 }],
];

const players = ROSTER.map(([name, number, position, birthYear, heightCm], i) => ({
  id: uuid(), teamId, name, number, position, birthYear, heightCm, active: true,
  notes: i === 6 ? "Falta muitos treinos por causa da escola (horário da tarde)." : undefined,
  createdAt: created + i,
}));
const skill = new Map(players.map((p, i) => [p.id, ROSTER[i][5]]));

// ---------- treinos + presenças ----------
const practices = [];
const attendance = [];
const THEMES = [
  "Transição defensiva, 3x2 e 2x1", "Pick & roll: ler a ajuda", "Lançamento 5 spots + lances livres",
  "Defesa homem-a-homem, fechar o garrafão", "Ataque contra zona 2-3", "Ressalto: bloquear e sair em contra-ataque",
  "Situações especiais (fim de período, reposições)", "Condição física + 1x1", "Preparação do jogo de sábado",
];
for (let d = new Date(addDays(FIRST_SAT, -26) + "T12:00:00Z"); d < new Date(TODAY + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const wd = d.getUTCDay();
  if (![1, 3, 5].includes(wd)) continue;
  if (chance(0.05)) continue; // treino cancelado
  const id = uuid();
  const date = d.toISOString().slice(0, 10);
  practices.push({
    id, teamId, date, title: `Treino #${practices.length + 1}`, durationMin: wd === 5 ? 75 : 90,
    intensity: wd === 5 ? 2 : int(3, 5), notes: THEMES[int(0, THEMES.length - 1)], createdAt: Date.parse(date + "T18:00:00Z"),
  });
  for (const p of players) {
    const a = skill.get(p.id).att;
    const r = rnd();
    const status = r < a ? (chance(0.08) ? "late" : "present") : chance(0.4) ? "excused" : "absent";
    attendance.push({ id: `${id}:${p.id}`, teamId, practiceId: id, playerId: p.id, status });
  }
}

// ---------- jogos ----------
// strength: >1 adversário mais forte (lança melhor e perde menos bolas)
const SCHEDULE = [
  ["Seven Stars", true, 1.00], ["Académica da Praia", false, 1.12], ["Travadores", true, 0.90], ["Sporting da Praia", false, 1.08],
  ["Bairro", true, 0.85], ["Boavista", false, 1.00], ["Achada Grande", true, 0.92], ["Seven Stars", false, 1.02],
  ["Académica da Praia", true, 1.06], ["Travadores", false, 0.95],
].map((g, i) => [addDays(FIRST_SAT, i * 7), ...g]);
const VIDEOS = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"];

const games = [];
const events = [];

// geometria FIBA (metros, origem no canto da linha de fundo)
const RIM = { x: 7.5, y: 1.575 };
function shotLoc(pts, player) {
  if (pts === 3) {
    if (chance(0.3)) return { x: r2(chance(.5) ? between(.15, .75) : between(14.25, 14.85)), y: r2(between(.3, 2.8)) }; // canto
    const a = between(0.25, Math.PI - 0.25);
    const d = between(6.95, 8.2);
    return { x: r2(RIM.x + Math.cos(a) * d), y: r2(RIM.y + Math.sin(a) * d) };
  }
  const big = ["PF", "C"].includes(player?.position ?? "");
  if (chance(big ? 0.8 : 0.55)) return { x: r2(between(5.6, 9.4)), y: r2(between(0.4, 5.2)) }; // garrafão
  const a = between(0.15, Math.PI - 0.15);
  const d = between(3.6, 6.3);
  return { x: r2(Math.min(14.3, Math.max(.7, RIM.x + Math.cos(a) * d))), y: r2(RIM.y + Math.sin(a) * d) };
}

SCHEDULE.forEach(([date, opponent, home, strength], gi) => {
  const gameId = uuid();
  const progress = gi / (SCHEDULE.length - 1); // 0 → 1 ao longo da época
  games.push({
    id: gameId, teamId, date, opponent, home, competition: "Regional Sub-16 — Santiago Sul",
    periods: 4, periodMinutes: 10, video: { kind: "youtube", url: VIDEOS[gi % 2] },
    notes: gi === 1 ? "Perdemos muitas bolas contra a pressão a campo inteiro." : undefined,
    createdAt: Date.parse(date + "T20:00:00Z"),
  });

  // quem está disponível (assiduidade influencia convocatória)
  const available = players.filter((p) => chance(0.55 + skill.get(p.id).att * 0.45));
  const rated = [...available].sort((a, b) => skill.get(b.id).usage - skill.get(a.id).usage);
  const starters = rated.slice(0, 5);
  const bench = rated.slice(5);
  let onCourt = [...starters];
  const fouls = new Map();

  let ts = between(60, 240); // o jogo começa uns minutos depois do início da gravação
  let seq = 0;
  const ev = (partial) => {
    events.push({ id: uuid(), teamId, gameId, createdAt: Date.parse(date + "T21:00:00Z") + seq++ * 1000, ...partial, videoTs: r2(ts) });
  };
  const sk = (p) => {
    const s = skill.get(p.id);
    const g = s.grow * progress;
    return { ...s, p2: s.p2 + g * 0.5, p3: s.p3 + g, ft: s.ft + g * 0.3 };
  };

  for (let period = 1; period <= 4; period++) {
    // rotação no início do período: 2.º e 4.º começam com o 5 inicial, 3.º pode mudar
    if (period === 3 && bench.length && chance(0.5)) onCourt = [...starters.slice(0, 4), bench[0]];
    else if (period !== 1) onCourt = [...starters].filter((p) => (fouls.get(p.id) ?? 0) < 4).concat(bench).slice(0, 5);
    ev({ side: "us", type: "PERIOD_START", period, meta: { lineup: onCourt.map((p) => p.id) } });

    const possessions = int(15, 18) * 2;
    let offense = period % 2 === 1 ? "us" : "opp";
    for (let k = 0; k < possessions; k++) {
      ts += between(14, 32);

      // substituições (~cada 3 min de jogo)
      if (k > 0 && k % 7 === 0 && bench.length) {
        const nSubs = int(1, 2);
        for (let s = 0; s < nSubs; s++) {
          const out = pickW(onCourt, (p) => 1 / skill.get(p.id).usage + (fouls.get(p.id) ?? 0));
          const candidates = [...starters, ...bench].filter((p) => !onCourt.includes(p) && (fouls.get(p.id) ?? 0) < 5);
          if (!candidates.length) break;
          const inn = pickW(candidates, (p) => (starters.includes(p) ? 3 : 1) * skill.get(p.id).usage);
          onCourt = onCourt.map((p) => (p === out ? inn : p));
          ev({ side: "us", type: "SUB", period, meta: { in: inn.id, out: out.id } });
          ts += between(1, 4);
        }
      }

      const us = offense === "us";
      const tovRate = us ? 0.17 - progress * 0.04 : 0.15 / strength;
      if (chance(tovRate)) {
        if (us) {
          const p = pickW(onCourt, (p) => sk(p).tov * sk(p).usage);
          const tt = chance(0.5) ? (chance(0.5) ? "pressao" : "transicao") : null;
          ev({ side: "us", playerId: p.id, type: "TOV", period, ...(tt ? { meta: { tags: [tt] } } : {}) });
          if (chance(0.5)) ev({ side: "opp", type: "STL", period });
        } else {
          ev({ side: "opp", type: "TOV", period });
          if (chance(0.45)) { const p = pickW(onCourt, (p) => sk(p).stl); ev({ side: "us", playerId: p.id, type: "STL", period }); }
        }
        offense = us ? "opp" : "us";
        continue;
      }

      // até 3 tentativas por posse (ressaltos ofensivos)
      for (let attempt = 0; attempt < 3; attempt++) {
        const shooter = us ? pickW(onCourt, (p) => sk(p).usage) : null;
        const s = shooter ? sk(shooter) : null;

        // falta no lançamento → 2 LL
        if (chance(0.13)) {
          if (us) {
            ev({ side: "us", playerId: shooter.id, type: "FOUL_DRAWN", period });
            ev({ side: "opp", type: "FOUL", period });
          } else {
            const f = pickW(onCourt, (p) => sk(p).foul);
            fouls.set(f.id, (fouls.get(f.id) ?? 0) + 1);
            ev({ side: "us", playerId: f.id, type: "FOUL", period });
          }
          ts += between(8, 20);
          let lastMiss = false;
          for (let ft = 0; ft < 2; ft++) {
            const made = chance(us ? s.ft : 0.6 * strength);
            ev({ side: us ? "us" : "opp", playerId: shooter?.id, type: "FT", period, meta: { made } });
            ts += between(3, 7);
            lastMiss = !made;
          }
          if (lastMiss) {
            const defUs = !us;
            if (defUs && chance(0.8)) { const r = pickW(onCourt, (p) => sk(p).reb); ev({ side: "us", playerId: r.id, type: "REB", period, meta: { off: false } }); }
            else if (!defUs && chance(0.75)) ev({ side: "opp", type: "REB", period, meta: { off: false } });
          }
          break;
        }

        const pts = us ? (chance(s.r3) ? 3 : 2) : chance(0.3) ? 3 : 2;
        const loc = shotLoc(pts, shooter);
        const paint = pts === 2 && loc.x >= 5.05 && loc.x <= 9.95 && loc.y <= 5.8;
        const zoneAdj = pts === 3 ? 0 : paint ? 0.07 : -0.1; // perto do cesto entra mais
        const tag = playTag(attempt);
        const pMake = (us ? (pts === 3 ? s.p3 : s.p2) : (pts === 3 ? 0.28 : 0.44) * strength) + zoneAdj + (tag ? TAG_BONUS[tag] ?? 0 : 0);
        const made = chance(pMake);
        ev({ side: us ? "us" : "opp", playerId: shooter?.id, type: "SHOT", period, meta: { pts, made, ...(tag ? { tags: [tag] } : {}) }, ...loc });

        // desarme (só nos 2 pontos falhados)
        if (!made && pts === 2 && chance(0.12)) {
          if (us) ev({ side: "opp", type: "BLK", period });
          else { const b = pickW(onCourt, (p) => sk(p).blk); ev({ side: "us", playerId: b.id, type: "BLK", period }); }
        }

        if (made) {
          if (us && chance(0.55)) {
            const a = pickW(onCourt.filter((p) => p !== shooter), (p) => sk(p).ast);
            ev({ side: "us", playerId: a.id, type: "AST", period });
          } else if (!us && chance(0.5)) ev({ side: "opp", type: "AST", period });
          break;
        }

        // ressalto
        ts += between(1, 3);
        const offReb = chance(us ? 0.3 : 0.27 * strength);
        const rebSide = offReb ? offense : us ? "opp" : "us";
        if (rebSide === "us") {
          const r = pickW(onCourt, (p) => sk(p).reb);
          ev({ side: "us", playerId: r.id, type: "REB", period, meta: { off: offReb } });
        } else ev({ side: "opp", type: "REB", period, meta: { off: offReb } });
        if (!offReb) break;
        ts += between(3, 8);
      }

      // falta não de lançamento, de vez em quando
      if (chance(0.12)) {
        if (!us) ev({ side: "opp", type: "FOUL", period });
        else {
          const f = pickW(onCourt, (p) => sk(p).foul);
          fouls.set(f.id, (fouls.get(f.id) ?? 0) + 1);
          ev({ side: "us", playerId: f.id, type: "FOUL", period });
        }
      }
      offense = us ? "opp" : "us";
    }
    ts += period === 2 ? between(420, 600) : between(100, 160); // intervalos
  }
});

// objetivos de exemplo
const now0 = Date.parse(FIRST_SAT + "T12:00:00Z");
const g = (i, o) => ({ id: uuid(), teamId, active: true, createdAt: now0 + i, ...o });
const goals = [
  g(1, { metric: "tov", target: 15, title: "Menos de 15 perdas por jogo" }),
  g(2, { metric: "opp_pts", target: 55 }),
  g(3, { metric: "wins", target: 7, dueDate: addDays(TODAY, 150) }),
  g(4, { playerId: players[0].id, metric: "ast", target: 4 }),
  g(5, { playerId: players[1].id, metric: "ft_pct", target: 70 }),
  g(6, { playerId: players[2].id, metric: "pts", target: 12 }),
  g(7, { playerId: players[3].id, metric: "att_pct", target: 90 }),
];

// ---------- agenda: próximos jogos e treinos ----------
const PAV = "Pavilhão Municipal";
const agenda = [];
const rsvps = [];
for (const gm of games) agenda.push({ id: gm.id, teamId, kind: "game", time: "17:00", location: gm.home ? PAV : "Fora", callup: players.slice(0, 12).map((p) => p.id), published: true });
for (const pr of practices) agenda.push({ id: pr.id, teamId, kind: "practice", time: "18:30", location: PAV });
const nextSat = addDays(LAST_SAT, 7);
const UPCOMING = [[nextSat, "Sporting da Praia", true], [addDays(nextSat, 7), "Bairro", false]];
UPCOMING.forEach(([date, opponent, home], i) => {
  const id = uuid();
  games.push({ id, teamId, date, opponent, home, competition: "Regional Sub-16 — Santiago Sul", periods: 4, periodMinutes: 10, video: { kind: "none" }, createdAt: Date.parse(TODAY + "T10:00:00Z") + i });
  const callup = players.slice(0, 11).map((p) => p.id);
  agenda.push({ id, teamId, kind: "game", time: "17:00", meetTime: "16:15", location: home ? PAV : "Pavilhão do Bairro", callup: i === 0 ? callup : [], published: i === 0, note: i === 0 ? "Equipamento branco. Chegar a horas para o aquecimento." : undefined });
  if (i === 0) callup.forEach((pid, k) => { if (k < 7) rsvps.push({ id: `${id}:${pid}`, teamId, refId: id, playerId: pid, status: k === 5 ? "maybe" : k === 6 ? "no" : "yes", note: k === 6 ? "Exame na escola" : undefined, answeredAt: Date.parse(TODAY + "T12:00:00Z") + k }); });
});
const futurePractices = [];
for (let d = 0; d < 14; d++) {
  const date = addDays(TODAY, d);
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  if (![1, 3, 5].includes(wd)) continue;
  const id = uuid();
  futurePractices.push(id);
  practices.push({ id, teamId, date, title: `Treino #${practices.length + 1}`, durationMin: wd === 5 ? 75 : 90, createdAt: Date.parse(TODAY + "T09:00:00Z") + d });
  agenda.push({ id, teamId, kind: "practice", time: "18:30", location: PAV });
}

// ---------- exercícios e plano dos próximos treinos ----------
const BASE = [
  ["Lançamento em 5 posições", ["lancamento"], 12], ["Lances livres com fadiga", ["ll"], 10], ["3x2 / 2x1 contínuo", ["transicao"], 12],
  ["Box-out 1x1 e 3x3", ["ressalto"], 10], ["Ataque contra pressão (4x4 + 1)", ["pressao", "tov"], 12], ["Pick & roll 2x2 — leituras", ["pnr"], 12],
  ["Shell drill 4x4", ["defesa"], 12], ["5x5 com regras", ["tatica"], 15],
];
const drills = BASE.map(([name, focus, minutes], i) => ({ id: uuid(), teamId, name, focus, minutes, createdAt: now0 + i }));
const plan = (ids) => ids.map((i) => ({ drillId: drills[i].id, name: drills[i].name, minutes: drills[i].minutes, focus: drills[i].focus }));
futurePractices.slice(0, 2).forEach((pid, k) => {
  const a = agenda.find((x) => x.id === pid);
  a.plan = k === 0 ? plan([0, 4, 3, 7]) : plan([1, 2, 6, 7]);
});

// ---------- scouting e feedback ----------
const scouting = [{ id: uuid(), teamId, name: "Sporting da Praia", keyPlayers: "#10 base rápido, entra sempre pela direita · #14 poste forte, fraco nos lances livres", notes: "Pressionam a campo inteiro depois de cesto. Defendem à zona 2-3 no 2.º período.", editedAt: now0 }];
const lastGame = games.filter((x) => x.date < TODAY).sort((a, b) => b.date.localeCompare(a.date))[0];
const feedback = [
  { id: uuid(), teamId, playerId: players[0].id, gameId: lastGame.id, clipStart: 600, clipEnd: 612, text: "Boa leitura no pick & roll! Aqui o defesa fechou cedo — o passe para o canto estava aberto.", author: "Melvyn", createdAt: Date.parse(TODAY + "T08:00:00Z") },
  { id: uuid(), teamId, playerId: players[0].id, text: "Esta semana: 50 lances livres depois de cada treino.", author: "Melvyn", createdAt: Date.parse(TODAY + "T08:05:00Z") },
];

// ---------- notas de vídeo e game plans ----------
const notes = [
  { id: uuid(), teamId, gameId: lastGame.id, videoTs: 420, period: 1, text: "Estamos a atacar demasiado cedo — só um passe antes de lançar.", author: "Melvyn", createdAt: Date.parse(TODAY + "T09:00:00Z") },
  { id: uuid(), teamId, gameId: lastGame.id, videoTs: 1900, period: 2, text: "O #11 abandona o canto na ajuda: rever com ele.", author: "Nico", createdAt: Date.parse(TODAY + "T09:01:00Z") },
  { id: uuid(), teamId, gameId: lastGame.id, videoTs: 3300, period: 3, text: "Boa execução do pick & roll lateral.", author: "Nico", createdAt: Date.parse(TODAY + "T09:02:00Z") },
];
const gp = (area, text, metric, op, value) => ({ id: uuid(), area, text, ...(metric ? { check: { metric, op, value } } : {}) });
const lastAgenda = agenda.find((a) => a.id === lastGame.id);
lastAgenda.plan = [
  gp("defesa", "Não deixar correr: máx. 8 pts em transição", "opp_transition_pts", "lte", 8),
  gp("defesa", "Bloquear o ressalto: máx. 8 ressaltos ofensivos deles", "opp_oreb", "lte", 8),
  gp("ataque", "Cuidar da bola: máx. 12 perdas", "our_tov", "lte", 12),
  gp("ataque", "Procurar o poste baixo no 1.º período"),
];
const nextAgenda = agenda.find((a) => a.kind === "game" && games.find((g) => g.id === a.id)?.date === nextSat);
nextAgenda.plan = [
  gp("defesa", "Não deixar correr: máx. 8 pts em transição", "opp_transition_pts", "lte", 8),
  gp("defesa", "Forçar o #10 deles para a mão esquerda"),
  gp("ataque", "Contra a pressão: 3 apoios à bola e passe por cima", "our_tov", "lte", 12),
  gp("ataque", "Atacar a zona 2-3 com o poste alto"),
];

// ---------- rotação planeada do próximo jogo (tempo igual pelos convocados) ----------
{
  const called = nextAgenda.callup;
  const rot = {};
  called.forEach((pid) => { rot[pid] = [0, 0, 0, 0]; });
  for (let q = 0; q < 4; q++) {
    let left = 50, k = q * 3;
    const base = Math.floor(50 / called.length);
    called.forEach((pid) => { rot[pid][q] = base; left -= base; });
    while (left > 0) { const pid = called[k++ % called.length]; if (rot[pid][q] < 10) { rot[pid][q]++; left--; } }
  }
  nextAgenda.rotation = rot;
}

// ---------- carga (esforço 1–10 depois dos treinos) e disponibilidade ----------
const wellness = [];
const pastPractices = practices.filter((p) => p.date <= TODAY && p.date >= addDays(TODAY, -35));
for (const pr of pastPractices) {
  for (const pl of players) {
    const att = attendance.find((a) => a.practiceId === pr.id && a.playerId === pl.id);
    if (!att || (att.status !== "present" && att.status !== "late")) continue;
    if (!chance(0.92)) continue; // quase todos respondem
    // o 3.º jogador teve uma semana muito mais pesada (treinos extra na seleção)
    const heavy = pl === players[2] && pr.date >= addDays(TODAY, -6);
    const rpe = Math.max(1, Math.min(10, (pr.intensity ?? 3) + 2 + int(0, 1) + (heavy ? 3 : 0)));
    wellness.push({ id: `${pr.id}:${pl.id}`, teamId, playerId: pl.id, kind: "session", refId: pr.id, date: pr.date, rpe, minutes: (pr.durationMin ?? 90) + (heavy ? 60 : 0), answeredAt: Date.parse(pr.date + "T21:00:00Z") });
  }
}
wellness.push({ id: `status:${players[4].id}`, teamId, playerId: players[4].id, kind: "status", date: addDays(TODAY, -1), status: "limited", note: "Dor no tornozelo, treino sem saltos", answeredAt: Date.parse(TODAY + "T08:00:00Z") });
wellness.push({ id: `status:${players[9].id}`, teamId, playerId: players[9].id, kind: "status", date: addDays(TODAY, -2), status: "out", note: "Doente (gripe)", answeredAt: Date.parse(TODAY + "T08:00:00Z") });

// ---------- perfil físico: 3 sessões de testes (início, meio, agora) e altura mensal ----------
const measurements = [];
const mSession = (date, evaluator, protocolOk = true) => ({ sessionId: uuid(), date, evaluator, protocolOk });
const S = [mSession(addDays(TODAY, -63), "Nico"), mSession(addDays(TODAY, -30), "Nico"), mSession(addDays(TODAY, -3), "Nico")];
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const addM = (pl, type, value, s, extra = {}) =>
  measurements.push({ id: uuid(), teamId, playerId: pl.id, type, value, date: s.date, sessionId: s.sessionId, evaluator: s.evaluator, ...extra, createdAt: Date.parse(s.date + "T19:00:00Z") + measurements.length });
players.forEach((pl, i) => {
  const h0 = pl.heightCm ?? 178;
  const spurt = i === 3; // o 4.º jogador está no pico de crescimento
  const grow = spurt ? 0.85 : 0.2 + (i % 3) * 0.12; // cm por mês (pico ≈ 10 cm/ano)
  const wing = h0 + 2 + (i % 5) - (i === 7 ? 6 : 0);
  const reach0 = Math.round(h0 * 1.31);
  const w0 = Math.round(h0 - 108 + (i % 4) * 3);
  const cmj0 = 34 + (i % 6) * 3 + (spurt ? -2 : 0);
  const lane0 = 12.6 - (i % 5) * 0.25;
  const spr0 = 3.75 - (i % 4) * 0.07;
  S.forEach((s, k) => {
    const months = (k === 0 ? 0 : k === 1 ? 1.1 : 2) ;
    const h = round1(h0 + grow * months);
    addM(pl, "altura", h, s);
    addM(pl, "peso", round1(w0 + months * (spurt ? 1.2 : 0.5)), s);
    if (k !== 1) addM(pl, "envergadura", round1(wing + grow * months), s);
    const reach = Math.round(reach0 + grow * months * 1.3);
    addM(pl, "alcance", reach, s);
    const off = k === 1 && i === 5; // sessão do meio sem aquecimento para um atleta
    const gain = [0, 1.5, 3][k] + (spurt ? -1 : 0) + (i % 2);
    const jumps = [0, 1, 2].map((a) => reach + Math.round(cmj0 + gain - a * 1.5 + (a === 1 ? 1 : 0)));
    addM(pl, "cmj", Math.max(...jumps) - reach, s, { attempts: jumps, base: reach, protocolOk: !off, notes: off ? "sem aquecimento padrão" : undefined });
    const run = [0, 1, 2].map((a) => reach + Math.round(cmj0 + 7 + gain - a));
    addM(pl, "salto_balanco", Math.max(...run) - reach, s, { attempts: run, base: reach, protocolOk: !off });
    const lanes = [0, 1, 2].map((a) => round2(lane0 - [0, 0.2, 0.35][k] + a * 0.12 + (spurt && k === 2 ? 0.25 : 0)));
    addM(pl, "lane", Math.min(...lanes), s, { attempts: lanes, protocolOk: !off });
    const sprints = [0, 1, 2].map((a) => round2(spr0 - [0, 0.04, 0.08][k] + a * 0.05));
    addM(pl, "sprint", Math.min(...sprints), s, { attempts: sprints, protocolOk: !off });
  });
  pl.heightCm = Math.round(h0 + grow * 2);
});

// ---------- v0.11: posições secundárias, ids no plano, anexos e um treino acompanhado ao vivo ----------
// Tudo aqui é determinístico e fica DEPOIS do último rnd(): os dados de antes não mudam com a mesma seed.
let n011 = 0;
const id011 = () => `00000000-0011-4000-a000-${String(++n011).padStart(12, "0")}`;
players[0].secondaryPositions = ["SG"];
players[2].secondaryPositions = ["SG", "PF"];
players[3].secondaryPositions = ["C"];
players[7].secondaryPositions = ["SG"];
drills[6].media = [{ id: id011(), kind: "link", url: "https://www.youtube.com/results?search_query=shell+drill+basketball", title: "Exemplos de shell drill (YouTube)", createdAt: now0 }];
const lastPractice = pastPractices[pastPractices.length - 1];
let lastInfo = agenda.find((x) => x.id === lastPractice.id);
if (!lastInfo) { lastInfo = { id: lastPractice.id, teamId, kind: "practice", time: "18:30", location: PAV }; agenda.push(lastInfo); }
lastInfo.plan = plan([0, 4, 6, 7]);
for (const a of agenda) if (a.kind === "practice" && a.plan) a.plan = a.plan.map((it) => ({ ...it, id: it.id ?? id011() }));
const at = (hhmm) => Date.parse(`${lastPractice.date}T${hhmm}:00Z`);
const [i0, i1, i2, i3] = lastInfo.plan;
const practice_runs = [{
  id: lastPractice.id, teamId, startedAt: at("18:35"), endedAt: at("19:32"), createdAt: at("18:35"),
  note: "Começámos 5 min tarde (pavilhão ocupado). O shell drill ficou para o próximo treino.",
  items: {
    [i0.id]: { status: "done", name: i0.name, plannedMin: i0.minutes, segments: [{ start: at("18:35"), end: at("18:49") }] },
    [i1.id]: { status: "done", name: i1.name, plannedMin: i1.minutes, segments: [{ start: at("18:50"), end: at("18:57") }, { start: at("18:59"), end: at("19:08") }], note: "Pausa de 2 min: lesão ligeira do #8 (tornozelo)." },
    [i2.id]: { status: "skipped", name: i2.name, plannedMin: i2.minutes, segments: [], reason: "Falta de tempo" },
    [i3.id]: { status: "done", name: i3.name, plannedMin: i3.minutes, segments: [{ start: at("19:10"), end: at("19:32") }] },
  },
}];

const data = {
  app: "basketball-analytics", version: 1, exportedAt: new Date().toISOString(), demo: true,
  teams: [team], players, practices, attendance, games, events, goals, agenda, rsvps, drills, scouting, feedback, notes, wellness, measurements, practice_runs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 1));
console.log(`✓ ${OUT}: ${players.length} jogadores, ${practices.length} treinos, ${games.length} jogos, ${events.length} eventos, ${goals.length} objetivos, agenda ${agenda.length}, ${drills.length} exercícios`);
