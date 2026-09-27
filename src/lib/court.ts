import { L, t } from "./i18n";

// FIBA half court, metres. Origin = left corner of our baseline, y grows toward half court.
export const COURT_W = 15;
export const COURT_H = 14;
export const RIM = { x: 7.5, y: 1.575 };
export const THREE_R = 6.75;
export const CORNER_X = 0.9; // corner three is 0.9 m from the sideline
// y where the straight corner line meets the arc
export const CORNER_Y = RIM.y + Math.sqrt(THREE_R ** 2 - (RIM.x - CORNER_X) ** 2);

export function isThree(x: number, y: number) {
  if (y <= CORNER_Y) return x < CORNER_X || x > COURT_W - CORNER_X;
  return Math.hypot(x - RIM.x, y - RIM.y) > THREE_R;
}

export type Zone = "Garrafão" | "Média distância" | "Triplo canto" | "Triplo";

export function zoneOf(x: number, y: number): Zone {
  if (isThree(x, y)) return y <= CORNER_Y ? "Triplo canto" : "Triplo";
  // restricted/paint: 4.9 m wide, 5.8 m deep
  if (x >= 5.05 && x <= 9.95 && y <= 5.8) return "Garrafão";
  return "Média distância";
}

export const ZONES: Zone[] = ["Garrafão", "Média distância", "Triplo canto", "Triplo"];

/** Zone names are ids (compared and stored as Portuguese); translate only when showing them. */
const ZONE_LABEL: Record<Zone, string> = {
  "Garrafão": L("Garrafão"), "Média distância": L("Média distância"), "Triplo canto": L("Triplo canto"), "Triplo": L("Triplo"),
};
export const zoneLabel = (z: Zone) => { const label = ZONE_LABEL[z] ?? z; return t(label); };
