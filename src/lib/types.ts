// Domain model. Everything is keyed by teamId so the app is multi-team from day one.
// The source of truth for games is the event log (GameEvent); all stats are derived.

export type ID = string;

export interface Team {
  id: ID;
  name: string; // "ABC"
  category: string; // "Sub-16"
  gender: "M" | "F";
  season: string; // "2026/27"
  createdAt: number;
}

export type Position = "PG" | "SG" | "SF" | "PF" | "C" | "";

export interface Player {
  id: ID;
  teamId: ID;
  name: string;
  number: number;
  position: Position;
  birthYear?: number;
  heightCm?: number;
  active: boolean;
  notes?: string;
  createdAt: number;
}

export interface Practice {
  id: ID;
  teamId: ID;
  date: string; // YYYY-MM-DD
  title?: string;
  durationMin?: number;
  intensity?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  createdAt: number;
}

export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export interface Attendance {
  id: ID; // `${practiceId}:${playerId}`
  teamId: ID;
  practiceId: ID;
  playerId: ID;
  status: AttendanceStatus;
  note?: string;
}

export type VideoSource =
  | { kind: "youtube"; url: string }
  | { kind: "file"; fileName?: string }
  | { kind: "url"; url: string }
  | { kind: "none" };

export interface Game {
  id: ID;
  teamId: ID;
  date: string;
  opponent: string;
  home: boolean;
  competition?: string;
  periods: number; // 4
  periodMinutes: number; // 10 (FIBA)
  video: VideoSource;
  notes?: string;
  createdAt: number;
}

export type Side = "us" | "opp";

export type EventType =
  | "SHOT" // meta.pts 2|3, meta.made
  | "FT" // meta.made
  | "REB" // meta.off
  | "AST"
  | "STL"
  | "BLK"
  | "TOV"
  | "FOUL"
  | "FOUL_DRAWN"
  | "SUB" // meta.in, meta.out (player ids)
  | "PERIOD_START"; // meta.lineup: player ids on court

export interface GameEvent {
  id: ID;
  teamId: ID;
  gameId: ID;
  side: Side;
  playerId?: ID; // undefined for opponent / team events
  type: EventType;
  period: number;
  videoTs: number; // seconds into the video — ordering key and "watch play" link
  x?: number; // metres, 0..15 across the court
  y?: number; // metres, 0..14 from our baseline
  meta?: {
    pts?: 2 | 3;
    made?: boolean;
    off?: boolean;
    in?: ID;
    out?: ID;
    lineup?: ID[];
    linkedTo?: ID; // e.g. an assist linked to the shot it created
  };
  createdAt: number;
}

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Presente",
  late: "Atrasado",
  absent: "Falta",
  excused: "Justificada",
};

export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];
