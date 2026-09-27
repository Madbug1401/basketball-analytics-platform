import type { EventType, GameEvent } from "./types";
import { L } from "./i18n";

export interface ActionDef {
  key: string; // keyboard shortcut in the video logger
  label: string; // marked with L(): translate it where it is shown
  type: EventType;
  meta?: GameEvent["meta"];
  tone?: "good" | "bad";
}

/** The stat buttons shared by the video logger and the live (bench) mode. */
export const ACTIONS: ActionDef[] = [
  { key: "q", label: L("2PT ✓"), type: "SHOT", meta: { pts: 2, made: true }, tone: "good" },
  { key: "w", label: L("2PT ✗"), type: "SHOT", meta: { pts: 2, made: false }, tone: "bad" },
  { key: "e", label: L("3PT ✓"), type: "SHOT", meta: { pts: 3, made: true }, tone: "good" },
  { key: "r", label: L("3PT ✗"), type: "SHOT", meta: { pts: 3, made: false }, tone: "bad" },
  { key: "t", label: L("LL ✓"), type: "FT", meta: { made: true }, tone: "good" },
  { key: "y", label: L("LL ✗"), type: "FT", meta: { made: false }, tone: "bad" },
  { key: "o", label: L("Ress. Of"), type: "REB", meta: { off: true } },
  { key: "d", label: L("Ress. Def"), type: "REB", meta: { off: false } },
  { key: "a", label: L("Assist."), type: "AST" },
  { key: "s", label: L("Roubo"), type: "STL" },
  { key: "b", label: L("Desarme"), type: "BLK" },
  { key: "p", label: L("Perda"), type: "TOV" },
  { key: "f", label: L("Falta"), type: "FOUL" },
  { key: "g", label: L("F. sofrida"), type: "FOUL_DRAWN" },
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
