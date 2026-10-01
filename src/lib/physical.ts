import { db, uid } from "./db";
import { L } from "./i18n";
import type { ID, MeasureType, Measurement, Player, Team } from "./types";

/* Physical profile: body measurements and field tests, kept as dated history.
   Tests follow a fixed protocol (same evaluator, standard warm-up, best of 3) so that
   changes over time are real and not measurement noise. */

export interface MeasureDef {
  type: MeasureType;
  label: string;
  short: string;
  unit: "cm" | "kg" | "s";
  kind: "body" | "test";
  lowerIsBetter?: boolean;
  attempts: boolean; // 3 attempts, the best counts
  jump?: boolean; // attempts are the mark reached; result = mark − standing reach
  staffOnly?: boolean; // hidden from the player
  min: number; max: number; // sanity range (for input validation)
  step: number; // decimals for display
  how: string; // protocol reminder
}

export const MEASURES: MeasureDef[] = [
  { type: "altura", label: L("Altura"), short: L("Altura"), unit: "cm", kind: "body", attempts: false, min: 120, max: 230, step: 1,
    how: L("Descalço, costas e calcanhares encostados à parede, olhar em frente. De manhã ou sempre à mesma hora.") },
  { type: "peso", label: L("Peso"), short: L("Peso"), unit: "kg", kind: "body", attempts: false, staffOnly: true, min: 25, max: 150, step: 1,
    how: L("Mesma balança, sem sapatos, antes do treino. Só a equipa técnica vê.") },
  { type: "envergadura", label: L("Envergadura"), short: L("Enverg."), unit: "cm", kind: "body", attempts: false, min: 120, max: 240, step: 1,
    how: L("Braços abertos na horizontal, costas na parede: da ponta de um dedo médio à ponta do outro.") },
  { type: "alcance", label: L("Alcance parado (standing reach)"), short: L("Alcance"), unit: "cm", kind: "body", attempts: false, min: 150, max: 300, step: 0,
    how: L("De lado para a parede, pés no chão, braço esticado ao máximo: marca a ponta dos dedos. É a base dos saltos.") },
  { type: "cmj", label: L("Salto vertical parado"), short: L("Salto parado"), unit: "cm", kind: "test", attempts: true, jump: true, min: 5, max: 120, step: 0,
    how: L("Sem corrida, com contramovimento e braços livres (sempre igual). Regista a marca atingida (cm do chão) nas 3 tentativas; a app subtrai o alcance.") },
  { type: "salto_balanco", label: L("Salto vertical com balanço"), short: L("Salto balanço"), unit: "cm", kind: "test", attempts: true, jump: true, min: 5, max: 130, step: 0,
    how: L("Com 2–3 passos de balanço, chamada a dois pés. Regista a marca atingida nas 3 tentativas.") },
  { type: "lane", label: L("Lane agility"), short: L("Lane agility"), unit: "s", kind: "test", attempts: true, lowerIsBetter: true, min: 7, max: 25, step: 2,
    how: L("Perímetro da área restritiva: sprint, deslocamento lateral, recuo e volta (percurso do NBA Combine). 3 tentativas, conta a melhor.") },
  { type: "sprint", label: L("Sprint ¾ de campo"), short: L("Sprint ¾"), unit: "s", kind: "test", attempts: true, lowerIsBetter: true, min: 2, max: 8, step: 2,
    how: L("Da linha de fundo à linha de lance livre do outro lado (≈22 m num campo FIBA), partida parada. 3 tentativas, conta a melhor.") },
];
export const MEASURE = Object.fromEntries(MEASURES.map((m) => [m.type, m])) as Record<MeasureType, MeasureDef>;

export const fmtValue = (t: MeasureType, v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? "–" : `${v.toFixed(MEASURE[t].step).replace(".", ",")} ${MEASURE[t].unit}`;
export const fmtDelta = (t: MeasureType, d: number | null | undefined) => {
  if (d === null || d === undefined || !isFinite(d)) return "";
  const s = Math.abs(d).toFixed(MEASURE[t].step).replace(".", ",");
  return `${d > 0 ? "+" : d < 0 ? "−" : "±"}${s}`;
};

/** Parse "8,52" / "8.52" / "245". */
export const parseNum = (s: string) => {
  const v = Number(s.trim().replace(",", "."));
  return s.trim() && isFinite(v) ? v : null;
};

/** Result of a test from its attempts: best (lowest for times); jumps: mark − reach. */
export function resultOf(type: MeasureType, attempts: number[], reach?: number): number | null {
  const ok = attempts.filter((a) => isFinite(a) && a > 0);
  if (!ok.length) return null;
  const def = MEASURE[type];
  const best = def.lowerIsBetter ? Math.min(...ok) : Math.max(...ok);
  if (def.jump) return reach ? Math.round((best - reach) * 10) / 10 : null;
  return best;
}

/** Is the value believable? (typos like 1.85 for height, or 850 for a sprint) */
export function plausible(type: MeasureType, v: number) {
  const d = MEASURE[type];
  return v >= d.min && v <= d.max;
}

export const byDate = (a: Measurement, b: Measurement) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;

/** A player's history of one measure (oldest first). */
export const historyOf = (all: Measurement[], playerId: ID, type: MeasureType) =>
  all.filter((m) => m.playerId === playerId && m.type === type).sort(byDate);

export const latestOf = (all: Measurement[], playerId: ID, type: MeasureType, upTo?: string) => {
  const h = historyOf(all, playerId, type).filter((m) => !upTo || m.date <= upTo);
  return h[h.length - 1];
};

export interface Trend {
  last?: Measurement;
  first?: Measurement; // first protocol-ok measurement (or first at all)
  delta: number | null; // last − first
  better: boolean | null; // the change is an improvement
  count: number;
}

export function trendOf(all: Measurement[], playerId: ID, type: MeasureType): Trend {
  const h = historyOf(all, playerId, type);
  const last = h[h.length - 1];
  const reliable = h.filter((m) => m.protocolOk !== false);
  const first = reliable[0] ?? h[0];
  const delta = last && first && last !== first ? last.value - first.value : null;
  const lower = MEASURE[type].lowerIsBetter;
  return { last, first, delta, better: delta === null || delta === 0 ? null : lower ? delta < 0 : delta > 0, count: h.length };
}

const daysBetween = (a: string, b: string) => (Date.parse(b + "T12:00") - Date.parse(a + "T12:00")) / 86400000;

/** Growth in cm per year from the height history (needs ≥ 2 heights at least 60 days apart). */
export function growthVelocity(all: Measurement[], playerId: ID): { cmPerYear: number; since: string } | null {
  const h = historyOf(all, playerId, "altura");
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  // earliest height within the last 12 months that is ≥ 60 days before the last
  const ref = h.find((m) => daysBetween(m.date, last.date) >= 60 && daysBetween(m.date, last.date) <= 400);
  if (!ref) return null;
  const days = daysBetween(ref.date, last.date);
  return { cmPerYear: ((last.value - ref.value) / days) * 365, since: ref.date };
}

/** ≥ 7 cm/year in a teenager usually means the growth spurt: more injury risk, coordination dips. */
export const growthTone = (v: number) => (v >= 7 ? "text-brand" : v >= 4 ? "" : "text-muted");

/** Wingspan − height (the "ape index"), from the latest of each. */
export function apeIndex(all: Measurement[], playerId: ID) {
  const w = latestOf(all, playerId, "envergadura"), h = latestOf(all, playerId, "altura");
  return w && h ? w.value - h.value : null;
}

/** Team average of the latest value of each player (for comparisons). */
export function teamAverage(all: Measurement[], players: Player[], type: MeasureType) {
  const vals = players.map((p) => latestOf(all, p.id, type)?.value).filter((v): v is number => v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Save a batch of measurements taken together, and keep the roster height up to date. */
export async function saveSession(rows: Omit<Measurement, "id" | "createdAt" | "sessionId">[]) {
  const sessionId = uid();
  const now = Date.now();
  const list: Measurement[] = rows.map((r, i) => ({ ...r, id: uid(), sessionId, createdAt: now + i }));
  await db.measurements.bulkAdd(list);
  // roster height = latest height measured
  for (const m of list.filter((x) => x.type === "altura")) {
    const all = await db.measurements.where("playerId").equals(m.playerId).filter((x) => x.type === "altura").toArray();
    const last = all.sort(byDate)[all.length - 1];
    if (last) await db.players.update(m.playerId, { heightCm: Math.round(last.value) });
  }
  return sessionId;
}

export const teamLabel = (t?: Team) => (t ? `${t.name} ${t.category} ${t.season}` : "");

/** Move a player up to another team: new player there, linked to this one, with the physical history copied. */
export async function movePlayer(player: Player, from: Team, to: Team, opts: { number?: number; deactivate?: boolean } = {}) {
  const id = uid();
  const now = Date.now();
  await db.players.add({
    id, teamId: to.id, name: player.name, number: opts.number ?? player.number, position: player.position,
    secondaryPositions: player.secondaryPositions, birthYear: player.birthYear, heightCm: player.heightCm, active: true, prevId: player.id, createdAt: now,
  });
  const hist = await db.measurements.where("playerId").equals(player.id).toArray();
  if (hist.length) {
    await db.measurements.bulkAdd(hist.map((m, i) => ({
      ...m, id: uid(), teamId: to.id, playerId: id, fromTeam: m.fromTeam ?? teamLabel(from), createdAt: now + i,
    })));
  }
  if (opts.deactivate) await db.players.update(player.id, { active: false });
  return { id, copied: hist.length };
}
