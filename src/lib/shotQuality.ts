import { COURT_H, COURT_W, RIM, isThree, zoneOf } from "./court";
import type { GameEvent, ID } from "./types";

/* Shot quality: where the shots come from and how many points a shot from there is worth.
   Expected points use every located shot recorded this season (ours and opponents'),
   pulled toward youth-basketball reference values while the sample is small. */

export type QZone = "Cesto" | "Garrafão" | "Média distância" | "Triplo canto" | "Triplo frontal";
export const QZONES: QZone[] = ["Cesto", "Garrafão", "Média distância", "Triplo canto", "Triplo frontal"];

/** reference field-goal % per zone (sub-16 level, conservative) */
const REF_FG: Record<QZone, number> = { Cesto: 0.52, Garrafão: 0.38, "Média distância": 0.33, "Triplo canto": 0.3, "Triplo frontal": 0.27 };
const PRIOR = 25; // shots of weight given to the reference

export function qZone(x: number, y: number): QZone {
  const z = zoneOf(x, y);
  if (z === "Triplo canto") return "Triplo canto";
  if (z === "Triplo") return "Triplo frontal";
  if (Math.hypot(x - RIM.x, y - RIM.y) <= 1.75) return "Cesto";
  return z === "Garrafão" ? "Garrafão" : "Média distância";
}

export const zoneValue = (z: QZone) => (z.startsWith("Triplo") ? 3 : 2);
const located = (e: GameEvent) => e.type === "SHOT" && e.x !== undefined && e.y !== undefined;

export interface ZoneModel { fg: Record<QZone, number>; xpps: Record<QZone, number>; sample: Record<QZone, number> }

/** Expected FG% / points per shot by zone, from a pool of shots (usually the whole season). */
export function zoneModel(pool: GameEvent[]): ZoneModel {
  const m = Object.fromEntries(QZONES.map((z) => [z, { m: 0, a: 0 }])) as Record<QZone, { m: number; a: number }>;
  for (const e of pool) {
    if (!located(e)) continue;
    const z = qZone(e.x!, e.y!);
    m[z].a++;
    if (e.meta?.made) m[z].m++;
  }
  const fg = {} as Record<QZone, number>, xpps = {} as Record<QZone, number>, sample = {} as Record<QZone, number>;
  for (const z of QZONES) {
    fg[z] = (m[z].m + PRIOR * REF_FG[z]) / (m[z].a + PRIOR);
    xpps[z] = fg[z] * zoneValue(z);
    sample[z] = m[z].a;
  }
  return { fg, xpps, sample };
}

export interface ZoneRow { zone: QZone; m: number; a: number; share: number; pps: number | null; xpps: number; fgExp: number }
export interface ShotProfile {
  fga: number; // all field-goal attempts
  located: number; // with a court location
  pts: number; // field-goal points (located shots)
  pps: number | null; // points per located shot
  xpps: number | null; // expected points per located shot (shot selection)
  making: number | null; // pps − xpps: finishing above/below expectation
  rimOr3: number | null; // share of shots at the rim or from three ("good diet")
  mid: number | null; // share of mid-range shots
  zones: ZoneRow[];
}

export function shotProfile(shots: GameEvent[], model: ZoneModel): ShotProfile {
  const fgas = shots.filter((e) => e.type === "SHOT");
  const loc = fgas.filter(located);
  const by = Object.fromEntries(QZONES.map((z) => [z, { m: 0, a: 0 }])) as Record<QZone, { m: number; a: number }>;
  let pts = 0, xp = 0;
  for (const e of loc) {
    const z = qZone(e.x!, e.y!);
    by[z].a++;
    xp += model.xpps[z];
    if (e.meta?.made) { by[z].m++; pts += isThree(e.x!, e.y!) || e.meta.pts === 3 ? 3 : 2; }
  }
  const n = loc.length;
  const zones = QZONES.map((z) => ({
    zone: z, m: by[z].m, a: by[z].a, share: n ? by[z].a / n : 0,
    pps: by[z].a ? (by[z].m * zoneValue(z)) / by[z].a : null, xpps: model.xpps[z], fgExp: model.fg[z],
  }));
  const good = by.Cesto.a + by["Triplo canto"].a + by["Triplo frontal"].a;
  return {
    fga: fgas.length, located: n, pts,
    pps: n ? pts / n : null, xpps: n ? xp / n : null, making: n ? (pts - xp) / n : null,
    rimOr3: n ? good / n : null, mid: n ? by["Média distância"].a / n : null, zones,
  };
}

/** Ranking of shooters: selection (xPPS) and making (PPS − xPPS). */
export function shooters(events: GameEvent[], model: ZoneModel, minShots = 5) {
  const byP = new Map<ID, GameEvent[]>();
  for (const e of events) if (e.type === "SHOT" && e.side === "us" && e.playerId) byP.set(e.playerId, [...(byP.get(e.playerId) ?? []), e]);
  return [...byP.entries()]
    .map(([playerId, s]) => ({ playerId, ...shotProfile(s, model) }))
    .filter((r) => r.located >= minShots)
    .sort((a, b) => (b.pps ?? 0) * b.located - (a.pps ?? 0) * a.located);
}

/** Zone of each cell of a grid over the court (for drawing zone heat maps). */
export function zoneGrid(step = 0.5) {
  const cells: { x: number; y: number; zone: QZone }[] = [];
  for (let y = 0; y < COURT_H; y += step) for (let x = 0; x < COURT_W; x += step) cells.push({ x, y, zone: qZone(x + step / 2, y + step / 2) });
  return cells;
}

export const fmtPps = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(2));
export const fmtDiff = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`);
