import Dexie, { type EntityTable } from "dexie";
import type { Attendance, Game, GameEvent, Player, Practice, Team } from "./types";

// Local-first storage (IndexedDB). Tables mirror supabase/schema.sql so the
// move to Postgres later is a sync layer, not a rewrite.
export const db = new Dexie("basketball-analytics") as Dexie & {
  teams: EntityTable<Team, "id">;
  players: EntityTable<Player, "id">;
  practices: EntityTable<Practice, "id">;
  attendance: EntityTable<Attendance, "id">;
  games: EntityTable<Game, "id">;
  events: EntityTable<GameEvent, "id">;
  videoHandles: EntityTable<{ gameId: string; handle: FileSystemFileHandle }, "gameId">;
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

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

export async function deleteGame(gameId: string) {
  await db.transaction("rw", db.games, db.events, db.videoHandles, async () => {
    await db.events.where("gameId").equals(gameId).delete();
    await db.videoHandles.delete(gameId);
    await db.games.delete(gameId);
  });
}

export async function deletePractice(practiceId: string) {
  await db.transaction("rw", db.practices, db.attendance, async () => {
    await db.attendance.where("practiceId").equals(practiceId).delete();
    await db.practices.delete(practiceId);
  });
}

export async function exportAll() {
  const [teams, players, practices, attendance, games, events] = await Promise.all([
    db.teams.toArray(),
    db.players.toArray(),
    db.practices.toArray(),
    db.attendance.toArray(),
    db.games.toArray(),
    db.events.toArray(),
  ]);
  return { app: "basketball-analytics", version: 1, exportedAt: new Date().toISOString(), teams, players, practices, attendance, games, events };
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
