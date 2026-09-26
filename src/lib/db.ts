import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { Attendance, Game, GameEvent, Player, Practice, Team } from "./types";
import { cloudConfigured } from "./supabase";

// Local-first storage (IndexedDB). In cloud mode every local write is also queued
// in `outbox` and pushed to Supabase by src/lib/sync.ts.

export type SyncedTable = "teams" | "players" | "practices" | "attendance" | "games" | "events";
export const SYNCED_TABLES: SyncedTable[] = ["teams", "players", "practices", "games", "attendance", "events"];

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
  await db.games.delete(gameId);
}

export async function deletePractice(practiceId: string) {
  await localOnly(["attendance"], async () => {
    await db.attendance.where("practiceId").equals(practiceId).delete();
  });
  await db.practices.delete(practiceId);
}

/** Removes every local row of a team without queueing anything (used after a server-side delete). */
export async function purgeTeamLocal(teamId: string) {
  const gameIds = await db.games.where("teamId").equals(teamId).primaryKeys();
  await localOnly(["teams", "players", "practices", "attendance", "games", "events", "videoHandles", "outbox"], async () => {
    await db.events.where("teamId").equals(teamId).delete();
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
  await localOnly(["teams", "players", "practices", "attendance", "games", "events", "videoHandles", "outbox", "meta"], async () => {
    await Promise.all([db.teams, db.players, db.practices, db.attendance, db.games, db.events, db.videoHandles, db.outbox, db.meta].map((t) => t.clear()));
  });
}

export async function exportAll(teamId?: string) {
  const byTeam = <T extends { teamId: string }>(rows: T[]) => (teamId ? rows.filter((r) => r.teamId === teamId) : rows);
  const [teams, players, practices, attendance, games, events] = await Promise.all([
    db.teams.toArray(),
    db.players.toArray(),
    db.practices.toArray(),
    db.attendance.toArray(),
    db.games.toArray(),
    db.events.toArray(),
  ]);
  return {
    app: "basketball-analytics", version: 1, exportedAt: new Date().toISOString(),
    teams: teamId ? teams.filter((t) => t.id === teamId) : teams,
    players: byTeam(players), practices: byTeam(practices), attendance: byTeam(attendance), games: byTeam(games), events: byTeam(events),
  };
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data?.app !== "basketball-analytics") throw new Error("Ficheiro inválido");
  await db.transaction("rw", [db.teams, db.players, db.practices, db.attendance, db.games, db.events], async () => {
    await db.teams.bulkPut(data.teams);
    await db.players.bulkPut(data.players);
    await db.practices.bulkPut(data.practices);
    await db.attendance.bulkPut(data.attendance);
    await db.games.bulkPut(data.games);
    await db.events.bulkPut(data.events);
  });
}
