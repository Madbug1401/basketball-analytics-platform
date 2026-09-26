import type { EventType, GameEvent } from "./types";

export interface ActionDef {
  key: string; // keyboard shortcut in the video logger
  label: string;
  type: EventType;
  meta?: GameEvent["meta"];
  tone?: "good" | "bad";
}

/** The stat buttons shared by the video logger and the live (bench) mode. */
export const ACTIONS: ActionDef[] = [
  { key: "q", label: "2PT ✓", type: "SHOT", meta: { pts: 2, made: true }, tone: "good" },
  { key: "w", label: "2PT ✗", type: "SHOT", meta: { pts: 2, made: false }, tone: "bad" },
  { key: "e", label: "3PT ✓", type: "SHOT", meta: { pts: 3, made: true }, tone: "good" },
  { key: "r", label: "3PT ✗", type: "SHOT", meta: { pts: 3, made: false }, tone: "bad" },
  { key: "t", label: "LL ✓", type: "FT", meta: { made: true }, tone: "good" },
  { key: "y", label: "LL ✗", type: "FT", meta: { made: false }, tone: "bad" },
  { key: "o", label: "Ress. Of", type: "REB", meta: { off: true } },
  { key: "d", label: "Ress. Def", type: "REB", meta: { off: false } },
  { key: "a", label: "Assist.", type: "AST" },
  { key: "s", label: "Roubo", type: "STL" },
  { key: "b", label: "Desarme", type: "BLK" },
  { key: "p", label: "Perda", type: "TOV" },
  { key: "f", label: "Falta", type: "FOUL" },
  { key: "g", label: "F. sofrida", type: "FOUL_DRAWN" },
];

/** FIBA: 2 timeouts in the 1st half, 3 in the 2nd, 1 per overtime. */
export function timeoutsAllowed(period: number, regulation = 4) {
  if (period > regulation) return 1;
  return period <= regulation / 2 ? 2 : 3;
}
export function timeoutBucket(period: number, regulation = 4) {
  if (period > regulation) return `ot${period}`;
  return period <= regulation / 2 ? "h1" : "h2";
}
