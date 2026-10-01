// Domain model. Everything is keyed by teamId so the app is multi-team from day one.
// The source of truth for games is the event log (GameEvent); all stats are derived.

import { L } from "./i18n";

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
  position: Position; // main position (shown in compact tables)
  // v0.11: other roles the athlete plays NOW (not a permanent label). Never contains `position`.
  secondaryPositions?: Position[];
  birthYear?: number;
  heightCm?: number;
  active: boolean;
  notes?: string;
  prevId?: ID; // same athlete in the team they came from (moved up an age group)
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
  { id: "transicao", label: L("Contra-ataque / transição"), short: L("Transição") },
  { id: "pnr", label: L("Pick & roll"), short: L("Pick & roll") },
  { id: "iso", label: L("Isolamento / 1x1"), short: L("1x1") },
  { id: "poste", label: L("Jogo de poste"), short: L("Poste") },
  { id: "segunda", label: L("2.ª oportunidade (após ressalto of.)"), short: L("2.ª oport.") },
  { id: "bloqueio", label: L("Saída de bloqueio / sem bola"), short: L("Sem bola") },
  { id: "zona", label: L("Contra defesa à zona"), short: L("Vs zona") },
  { id: "pressao", label: L("Contra pressão"), short: L("Vs pressão") },
];
export const TAG_LABEL = Object.fromEntries(PLAY_TAGS.map((tg) => [tg.id, tg.short])) as Record<PlayTag, string>;

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

export const RSVP_LABEL: Record<RsvpStatus, string> = { yes: L("Vou"), maybe: L("Talvez"), no: L("Não posso") };

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

/* ---------- physical profile ---------- */

export type MeasureType = "altura" | "peso" | "envergadura" | "alcance" | "cmj" | "salto_balanco" | "lane" | "sprint";

/** One measurement of one athlete on one day. Kept as history (never overwritten). */
export interface Measurement {
  id: ID;
  teamId: ID;
  playerId: ID;
  type: MeasureType;
  value: number; // result (best attempt; jumps: mark − standing reach)
  date: string; // YYYY-MM-DD
  sessionId?: ID; // measurements taken together
  attempts?: number[]; // raw attempts (jumps: marks reached, cm)
  base?: number; // jumps: standing reach used (cm)
  evaluator?: string;
  protocolOk?: boolean; // same evaluator, standard warm-up, 3 attempts
  notes?: string;
  fromTeam?: string; // copied from a previous team (e.g. "Sub-14 2025/26")
  createdAt: number;
}

/* ---------- training load & availability ---------- */

export type Availability = "ok" | "limited" | "out";
export const AVAILABILITY_LABEL: Record<Availability, string> = { ok: L("Disponível"), limited: L("Condicionado"), out: L("Indisponível") };

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
  lancamento: L("Lançamento|área"), ll: L("Lances livres"), passe: L("Passe"), tov: L("Perdas de bola"), ressalto: L("Ressalto|área"),
  defesa: L("Defesa"), transicao: L("Transição"), pressao: L("Contra pressão"), zona: L("Contra zona"), pnr: L("Pick & roll"),
  fisico: L("Físico"), tatica: L("Tática / sistemas"),
};

export interface Drill {
  id: ID;
  teamId: ID;
  name: string;
  focus: DrillFocus[];
  minutes?: number;
  description?: string;
  media?: DrillMedia[]; // v0.11: images, short videos, YouTube or other links (see src/lib/media.ts)
  createdAt: number;
}

/**
 * One attachment of a drill (v0.11).
 * - "youtube" / "link": only the address is stored (`url`).
 * - "image" / "video": the file lives in Supabase Storage (bucket `drill-media`) at `path`
 *   = `${teamId}/${drillId}/${id}.${ext}`. Until it is uploaded (offline, local mode) the bytes stay
 *   on the device in the local-only `mediaFiles` table, keyed by the same `id`.
 */
export interface DrillMedia {
  id: ID;
  kind: "youtube" | "link" | "image" | "video";
  url?: string;
  path?: string;
  title?: string;
  mime?: string;
  size?: number; // bytes (files)
  createdAt: number;
}

export interface PlanItem {
  id?: ID; // v0.11: stable id, so the practice run (PracticeRun.items) can point to it. Old plans get one on first save (lib/practiceRun.ts withIds)
  drillId?: ID;
  name: string;
  minutes: number;
  focus?: DrillFocus[];
  note?: string;
}

/* ---------- following the plan during practice (v0.11) ---------- */

export type RunStatus = "todo" | "running" | "paused" | "done" | "skipped";

/** A stretch of effective time on one exercise (epoch ms). `end` missing = still running. */
export interface RunSegment { start: number; end?: number }

/** What happened to one plan item. `name`/`plannedMin` are a snapshot, so the summary survives later plan edits. */
export interface RunItem {
  status: RunStatus;
  name: string;
  plannedMin: number;
  segments: RunSegment[]; // effective time = sum of segments (pauses are the gaps)
  reason?: string; // skipped: why (optional)
  note?: string;
}

/**
 * How a practice actually went, next to its plan (agenda.plan). One row per practice, id = practice id.
 * Kept apart from the plan so editing the plan and logging the practice never overwrite each other.
 * Staff only (see supabase/migrations/2026-10-01-v11.sql).
 */
export interface PracticeRun {
  id: ID; // = practice id
  teamId: ID;
  items: Record<ID, RunItem>; // by PlanItem.id (items still "todo" may be missing)
  note?: string; // general note at the end
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
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
  present: L("Presente"),
  late: L("Atrasado"),
  absent: L("Falta|presença"),
  excused: L("Justificada"),
};

export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

/** Full name of each position (the short code stays in compact tables). v0.11 */
export const POSITION_LABEL: Record<Exclude<Position, "">, string> = {
  PG: L("Base"), SG: L("Lançador"), SF: L("Extremo"), PF: L("Extremo-poste"), C: L("Poste|posição"),
};

/** Secondary positions without duplicates and without the main one (v0.11). */
export const secondaryOf = (p: Pick<Player, "position" | "secondaryPositions">): Position[] =>
  [...new Set(p.secondaryPositions ?? [])].filter((x) => x && x !== p.position);
