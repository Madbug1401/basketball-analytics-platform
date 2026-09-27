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
  | "PERIOD_START" // meta.lineup: player ids on court
  | "PERIOD_END" // live mode: the period clock reached 0
  | "TIMEOUT"; // side = who called it

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
    tags?: PlayTag[]; // play context (transition, pick & roll…)
  };
  createdAt: number;
}

/* ---------- play context ---------- */

export type PlayTag = "transicao" | "pnr" | "iso" | "poste" | "segunda" | "bloqueio" | "zona" | "pressao";

export const PLAY_TAGS: { id: PlayTag; label: string; short: string }[] = [
  { id: "transicao", label: "Contra-ataque / transição", short: "Transição" },
  { id: "pnr", label: "Pick & roll", short: "Pick & roll" },
  { id: "iso", label: "Isolamento / 1x1", short: "1x1" },
  { id: "poste", label: "Jogo de poste", short: "Poste" },
  { id: "segunda", label: "2.ª oportunidade (após ressalto of.)", short: "2.ª oport." },
  { id: "bloqueio", label: "Saída de bloqueio / sem bola", short: "Sem bola" },
  { id: "zona", label: "Contra defesa à zona", short: "Vs zona" },
  { id: "pressao", label: "Contra pressão", short: "Vs pressão" },
];
export const TAG_LABEL = Object.fromEntries(PLAY_TAGS.map((t) => [t.id, t.short])) as Record<PlayTag, string>;

/* ---------- goals ---------- */

export type GoalMetric =
  | "pts" | "reb" | "oreb" | "ast" | "stl" | "blk" | "tov" | "eff" | "p3m" // per game
  | "fg_pct" | "p3_pct" | "ft_pct" // percentages
  | "att_pct" // practice attendance (players)
  | "opp_pts" | "wins"; // team only

export interface Goal {
  id: ID;
  teamId: ID;
  playerId?: ID; // undefined = team goal
  metric: GoalMetric;
  target: number;
  title?: string;
  dueDate?: string; // YYYY-MM-DD
  active: boolean;
  createdAt: number;
}

/* ---------- calendar / call-ups ---------- */

/** Extra info for a game or practice (same id): time, place, call-up. Staff edit, everyone reads. */
export interface Agenda {
  id: ID; // game or practice id
  teamId: ID;
  kind: "game" | "practice";
  time?: string; // HH:MM
  meetTime?: string; // HH:MM (concentração)
  location?: string;
  callup?: ID[]; // convocados (games)
  published?: boolean; // call-up visible to players
  plan?: PlanItem[]; // practice plan
  note?: string; // message to the players
  rotation?: Rotation; // games: planned minutes per player and period
}

/** Planned minutes per player, one number per regulation period. */
export type Rotation = Record<ID, number[]>;

export type RsvpStatus = "yes" | "maybe" | "no";

/** A player's answer for a game/practice. id = `${refId}:${playerId}`. Players write their own. */
export interface Rsvp {
  id: ID;
  teamId: ID;
  refId: ID;
  playerId: ID;
  status: RsvpStatus;
  note?: string;
  answeredAt: number;
}

export const RSVP_LABEL: Record<RsvpStatus, string> = { yes: "Vou", maybe: "Talvez", no: "Não posso" };

/* ---------- feedback ---------- */

export interface Feedback {
  id: ID;
  teamId: ID;
  playerId: ID;
  gameId?: ID;
  clipStart?: number; // video seconds
  clipEnd?: number;
  eventIds?: ID[];
  text: string;
  author?: string;
  report?: PlayerReport; // post-game individual report
  createdAt: number;
}

export interface ReportClip { start: number; end: number; label: string }
/** Snapshot of one player's game, sent as feedback (so it stays as it was when sent). */
export interface PlayerReport {
  gameId: ID;
  opponent: string;
  home: boolean;
  date: string;
  score: [number, number]; // us, them
  line: { min: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number; pm: number; eff: number };
  avg?: { pts: number; reb: number; ast: number; tov: number; eff: number; games: number }; // season average before this game
  good?: ReportClip;
  improve?: ReportClip;
  goal?: { title: string; value: string; progress: number }; // progress 0..1
  trend?: number[]; // efficiency in the last games (this one last)
}

/* ---------- training load & availability ---------- */

export type Availability = "ok" | "limited" | "out";
export const AVAILABILITY_LABEL: Record<Availability, string> = { ok: "Disponível", limited: "Condicionado", out: "Indisponível" };

/** Player self-report. kind "session": effort (RPE) after a practice/game, id = `${refId}:${playerId}`.
    kind "status": current availability, id = `status:${playerId}`. Players write their own; staff read all. */
export interface Wellness {
  id: ID;
  teamId: ID;
  playerId: ID;
  kind: "session" | "status";
  refId?: ID;
  date: string; // YYYY-MM-DD
  rpe?: number; // 1..10
  minutes?: number;
  status?: Availability;
  note?: string;
  answeredAt: number;
}

/** "Seen" receipt a player writes for a feedback item (id = feedback id). */
export interface Seen {
  id: ID;
  teamId: ID;
  playerId: ID;
  seenAt: number;
}

/* ---------- practice planning ---------- */

export type DrillFocus = "lancamento" | "ll" | "passe" | "tov" | "ressalto" | "defesa" | "transicao" | "pressao" | "zona" | "pnr" | "fisico" | "tatica";

export const FOCUS_LABEL: Record<DrillFocus, string> = {
  lancamento: "Lançamento", ll: "Lances livres", passe: "Passe", tov: "Perdas de bola", ressalto: "Ressalto",
  defesa: "Defesa", transicao: "Transição", pressao: "Contra pressão", zona: "Contra zona", pnr: "Pick & roll",
  fisico: "Físico", tatica: "Tática / sistemas",
};

export interface Drill {
  id: ID;
  teamId: ID;
  name: string;
  focus: DrillFocus[];
  minutes?: number;
  description?: string;
  createdAt: number;
}

export interface PlanItem {
  drillId?: ID;
  name: string;
  minutes: number;
  focus?: DrillFocus[];
  note?: string;
}

/* ---------- scouting ---------- */

export interface Scouting {
  id: ID;
  teamId: ID;
  name: string; // opponent name (as written in games)
  notes?: string;
  keyPlayers?: string;
  editedAt: number;
}

/* ---------- coach video notes (staff only) ---------- */

export interface VideoNote {
  id: ID;
  teamId: ID;
  gameId: ID;
  videoTs: number;
  period: number;
  text: string;
  author?: string;
  createdAt: number;
}

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Presente",
  late: "Atrasado",
  absent: "Falta",
  excused: "Justificada",
};

export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];
