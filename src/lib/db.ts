import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { Agenda, Attendance, Drill, Feedback, Game, GameEvent, Goal, Player, Practice, Rsvp, Scouting, Seen, Measurement, Team, VideoNote, Wellness } from "./types";
import { cloudConfigured } from "./supabase";
import { t } from "./i18n";

// Local-first storage (IndexedDB). In cloud mode every local write is also queued
// in `outbox` and pushed to Supabase by src/lib/sync.ts.

export type SyncedTable = "teams" | "players" | "practices" | "attendance" | "games" | "events" | "goals" | "agenda" | "rsvps" | "feedback" | "seen" | "drills" | "scouting" | "notes" | "wellness" | "measurements";
// order matters for uploads (foreign keys): parents first
export const SYNCED_TABLES: SyncedTable[] = ["teams", "players", "practices", "games", "attendance", "events", "goals", "agenda", "rsvps", "feedback", "seen", "drills", "scouting", "notes", "wellness", "measurements"];

export interface OutboxEntry {
  seq?: number;
  table: SyncedTable;
  rowId: string;
  teamId?: string;
  op: "upsert" | "delete";
}

export const db = new Dexie("basketball-analytics") as Dexie & {
  teams: EntityTable<Team, "id">;
  players: EntityTable<Player, "id">;
  practices: EntityTable<Practice, "id">;
  attendance: EntityTable<Attendance, "id">;
  games: EntityTable<Game, "id">;
  events: EntityTable<GameEvent, "id">;
  goals: EntityTable<Goal, "id">;
  agenda: EntityTable<Agenda, "id">;
  rsvps: EntityTable<Rsvp, "id">;
  feedback: EntityTable<Feedback, "id">;
  seen: EntityTable<Seen, "id">;
  drills: EntityTable<Drill, "id">;
  scouting: EntityTable<Scouting, "id">;
  notes: EntityTable<VideoNote, "id">;
  wellness: EntityTable<Wellness, "id">;
  measurements: EntityTable<Measurement, "id">;
  pushQueue: EntityTable<PushJob, "seq">;
  videoHandles: EntityTable<{ gameId: string; handle: FileSystemFileHandle }, "gameId">;
  outbox: EntityTable<OutboxEntry, "seq">;
  meta: EntityTable<{ key: string; value: unknown }, "key">;
};

db.version(1).stores({
  teams: "id, createdAt",
  players: "id, teamId, [teamId+number]",
  practices: "id, teamId, date",
  attendance: "id, teamId, practiceId, playerId",
  games: "id, teamId, date",
  events: "id, teamId, gameId, [gameId+videoTs], playerId, createdAt",
  videoHandles: "gameId",
});
db.version(2).stores({
  outbox: "++seq, table, rowId, teamId",
  meta: "key",
});
db.version(3).stores({
  goals: "id, teamId, playerId",
});
db.version(4).stores({
  agenda: "id, teamId",
  rsvps: "id, teamId, refId, playerId",
  feedback: "id, teamId, playerId, gameId",
  seen: "id, teamId, playerId",
  drills: "id, teamId",
  scouting: "id, teamId, name",
});
db.version(5).stores({
  notes: "id, teamId, gameId",
});
db.version(6).stores({
  wellness: "id, teamId, playerId, date",
  pushQueue: "++seq",
});
db.version(7).stores({
  measurements: "id, teamId, playerId, sessionId, date",
});

/** A notification waiting to be sent (kept on this device until online; see src/lib/push.ts). */
export interface PushJob {
  seq?: number;
  teamId: string;
  players?: string[]; // notify these players
  staff?: boolean; // notify the staff
  title: string;
  body: string;
  url: string;
  tag?: string;
  createdAt: number;
}

/* ---------- change capture ---------- */

type TxWithFlag = Transaction & { __remote?: boolean };
let onEnqueue: () => void = () => {};
export const setEnqueueListener = (fn: () => void) => { onEnqueue = fn; };

function capture(table: SyncedTable) {
  const t = db.table(table);
  const push = (tx: Transaction, entry: OutboxEntry) => {
    if (!cloudConfigured || (tx as TxWithFlag).__remote) return;
    tx.on("complete", () => { db.outbox.add(entry).then(() => onEnqueue()); });
  };
  const teamOf = (obj: { teamId?: string; id?: string } | undefined) => (table === "teams" ? obj?.id : obj?.teamId);
  t.hook("creating", function (primKey, obj, tx) {
    push(tx, { table, rowId: String(primKey ?? obj.id), teamId: teamOf(obj), op: "upsert" });
  });
  t.hook("updating", function (_mods, primKey, obj, tx) {
    push(tx, { table, rowId: String(primKey), teamId: teamOf(obj), op: "upsert" });
  });
  t.hook("deleting", function (primKey, obj, tx) {
    push(tx, { table, rowId: String(primKey), teamId: teamOf(obj), op: "delete" });
  });
}
SYNCED_TABLES.forEach(capture);

/** Runs writes that must NOT be queued for upload (data coming from the server, cascades the server already does). */
export async function localOnly<T>(tables: string[], fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", tables, async () => {
    (Dexie.currentTransaction as TxWithFlag).__remote = true;
    return fn();
  });
}

/* ---------- helpers ---------- */

export const uid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // fallback RFC4122 v4
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export const today = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

/** Delete a game: the server cascades its events, so locally they are removed without queueing. */
export async function deleteGame(gameId: string) {
  await localOnly(["events", "videoHandles"], async () => {
    await db.events.where("gameId").equals(gameId).delete();
    await db.videoHandles.delete(gameId);
  });
  // messages/reports sent to players stay, unlinked from the game (the server does `set null` too;
  // queueing it also avoids a FK error if the feedback was never uploaded)
  const linked = await db.feedback.filter((f) => f.gameId === gameId).toArray();
  for (const f of linked) await db.feedback.update(f.id, { gameId: undefined, clipStart: undefined, clipEnd: undefined, eventIds: undefined });
  await db.games.delete(gameId);
  await db.agenda.delete(gameId);
  await db.rsvps.where("refId").equals(gameId).delete();
  await db.wellness.filter((w) => w.refId === gameId).delete(); // same as a practice: its effort answers go too
  await localOnly(["notes"], () => db.notes.where("gameId").equals(gameId).delete()); // server cascades
}

export async function deletePractice(practiceId: string) {
  await localOnly(["attendance"], async () => {
    await db.attendance.where("practiceId").equals(practiceId).delete();
  });
  await db.practices.delete(practiceId);
  await db.agenda.delete(practiceId);
  await db.rsvps.where("refId").equals(practiceId).delete();
  await db.wellness.filter((w) => w.refId === practiceId).delete();
}

/** Removes every local row of a team without queueing anything (used after a server-side delete). */
export async function purgeTeamLocal(teamId: string) {
  const gameIds = await db.games.where("teamId").equals(teamId).primaryKeys();
  await localOnly(["teams", "players", "practices", "attendance", "games", "events", "goals", "agenda", "rsvps", "feedback", "seen", "drills", "scouting", "notes", "wellness", "measurements", "videoHandles", "outbox"], async () => {
    await db.events.where("teamId").equals(teamId).delete();
    await db.goals.where("teamId").equals(teamId).delete();
    for (const t of [db.agenda, db.rsvps, db.feedback, db.seen, db.drills, db.scouting, db.notes, db.wellness, db.measurements]) await t.where("teamId").equals(teamId).delete();
    await db.attendance.where("teamId").equals(teamId).delete();
    await db.games.where("teamId").equals(teamId).delete();
    await db.practices.where("teamId").equals(teamId).delete();
    await db.players.where("teamId").equals(teamId).delete();
    await db.videoHandles.bulkDelete(gameIds as string[]);
    await db.outbox.where("teamId").equals(teamId).delete();
    await db.teams.delete(teamId);
  });
}

export async function clearAllLocal() {
  await localOnly(["teams", "players", "practices", "attendance", "games", "events", "goals", "agenda", "rsvps", "feedback", "seen", "drills", "scouting", "notes", "wellness", "measurements", "pushQueue", "videoHandles", "outbox", "meta"], async () => {
    await Promise.all([db.teams, db.players, db.practices, db.attendance, db.games, db.events, db.goals, db.agenda, db.rsvps, db.feedback, db.seen, db.drills, db.scouting, db.notes, db.wellness, db.measurements, db.pushQueue, db.videoHandles, db.outbox, db.meta].map((t) => t.clear()));
  });
}

export async function exportAll(teamId?: string) {
  const byTeam = <T extends { teamId: string }>(rows: T[]) => (teamId ? rows.filter((r) => r.teamId === teamId) : rows);
  const [teams, players, practices, attendance, games, events, goals, agenda, rsvps, feedback, seen, drills, scouting, notes, wellness, measurements] = await Promise.all([
    db.teams.toArray(),
    db.players.toArray(),
    db.practices.toArray(),
    db.attendance.toArray(),
    db.games.toArray(),
    db.events.toArray(),
    db.goals.toArray(),
    db.agenda.toArray(),
    db.rsvps.toArray(),
    db.feedback.toArray(),
    db.seen.toArray(),
    db.drills.toArray(),
    db.scouting.toArray(),
    db.notes.toArray(),
    db.wellness.toArray(),
    db.measurements.toArray(),
  ]);
  return {
    app: "basketball-analytics", version: 1, exportedAt: new Date().toISOString(),
    teams: teamId ? teams.filter((t) => t.id === teamId) : teams,
    players: byTeam(players), practices: byTeam(practices), attendance: byTeam(attendance), games: byTeam(games), events: byTeam(events), goals: byTeam(goals),
    agenda: byTeam(agenda), rsvps: byTeam(rsvps), feedback: byTeam(feedback), seen: byTeam(seen), drills: byTeam(drills), scouting: byTeam(scouting), notes: byTeam(notes), wellness: byTeam(wellness), measurements: byTeam(measurements),
  };
}

type Export = Awaited<ReturnType<typeof exportAll>>;
type Optional = "goals" | "agenda" | "rsvps" | "feedback" | "seen" | "drills" | "scouting" | "notes" | "wellness" | "measurements";
export async function importAll(data: Omit<Export, Optional> & Partial<Pick<Export, Optional>>) {
  if (data?.app !== "basketball-analytics") throw new Error(t("Ficheiro inválido"));
  await db.transaction("rw", [db.teams, db.players, db.practices, db.attendance, db.games, db.events, db.goals, db.agenda, db.rsvps, db.feedback, db.seen, db.drills, db.scouting, db.notes, db.wellness, db.measurements], async () => {
    await db.teams.bulkPut(data.teams);
    await db.players.bulkPut(data.players);
    await db.practices.bulkPut(data.practices);
    await db.attendance.bulkPut(data.attendance);
    await db.games.bulkPut(data.games);
    await db.events.bulkPut(data.events);
    if (data.goals?.length) await db.goals.bulkPut(data.goals);
    if (data.agenda?.length) await db.agenda.bulkPut(data.agenda);
    if (data.rsvps?.length) await db.rsvps.bulkPut(data.rsvps);
    if (data.feedback?.length) await db.feedback.bulkPut(data.feedback);
    if (data.seen?.length) await db.seen.bulkPut(data.seen);
    if (data.drills?.length) await db.drills.bulkPut(data.drills);
    if (data.scouting?.length) await db.scouting.bulkPut(data.scouting);
    if (data.notes?.length) await db.notes.bulkPut(data.notes);
    if (data.wellness?.length) await db.wellness.bulkPut(data.wellness);
    if (data.measurements?.length) await db.measurements.bulkPut(data.measurements);
  });
}

/* ---------- import into a team (new ids) ---------- */

const ID_TABLES = ["players", "practices", "games", "events", "goals", "feedback", "drills", "scouting", "notes", "measurements"] as const;
const DATA_TABLES = ["players", "practices", "attendance", "games", "events", "goals", "agenda", "rsvps", "feedback", "seen", "drills", "scouting", "notes", "wellness", "measurements"] as const;
type DataTable = (typeof DATA_TABLES)[number];

export interface ImportSummary { players: number; games: number; events: number; practices: number; total: number }

/**
 * Imports a backup (.json) INTO a team: every row gets a fresh id and points to that team, so the same
 * file can be imported many times and never clashes with rows already on the server.
 * Without a target team, a new team is created from the file's team info.
 */
export async function importIntoTeam(data: Record<string, unknown>, target: Team | null): Promise<{ teamId: string; summary: ImportSummary }> {
  if (data?.app !== "basketball-analytics") throw new Error(t("Este ficheiro não é uma cópia do Courtside."));
  const srcTeams = (data.teams as Team[] | undefined) ?? [];
  const src = srcTeams[0];
  const teamId = target?.id ?? uid();
  const rowsOf = (t: DataTable) => ((data[t] as Record<string, unknown>[] | undefined) ?? []).filter((r) => !src || r.teamId === src.id);

  // old id → new id, for every entity referenced by others
  const map = new Map<string, string>();
  if (src) map.set(src.id, teamId);
  for (const t of ID_TABLES) for (const r of rowsOf(t)) map.set(String(r.id), uid());
  for (const r of rowsOf("measurements")) if (r.sessionId && !map.has(String(r.sessionId))) map.set(String(r.sessionId), uid());

  // replace ids anywhere: plain values, "a:b" composite ids, arrays, nested objects and object keys (rotation)
  const swap = (s: string) => map.get(s) ?? (s.includes(":") ? s.split(":").map((p) => map.get(p) ?? p).join(":") : s);
  const remap = (v: unknown): unknown => {
    if (typeof v === "string") return swap(v);
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [swap(k), remap(x)]));
    return v;
  };

  const out = Object.fromEntries(DATA_TABLES.map((t) => [t, rowsOf(t).map((r) => ({ ...(remap(r) as Record<string, unknown>), teamId }))])) as unknown as Record<DataTable, Record<string, unknown>[]>;
  // agenda rows for games/practices whose id was remapped keep their link (id = game/practice id)
  const tables = DATA_TABLES.map((t) => db.table(t));
  await db.transaction("rw", [db.teams, ...tables], async () => {
    if (!target) {
      await db.teams.add({ id: teamId, name: src?.name ?? "Equipa", category: src?.category ?? "", gender: src?.gender ?? "M", season: src?.season ?? "", createdAt: Date.now() });
    }
    for (const t of DATA_TABLES) if (out[t].length) await db.table(t).bulkAdd(out[t]);
  });
  // the roster height follows the latest measured height (already true in the file); nothing else to fix
  const total = DATA_TABLES.reduce((a, t) => a + out[t].length, 0);
  return { teamId, summary: { players: out.players.length, games: out.games.length, events: out.events.length, practices: out.practices.length, total } };
}
