"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { db, localOnly, purgeTeamLocal, setEnqueueListener, SYNCED_TABLES, type OutboxEntry, type SyncedTable } from "./db";

/* ---------- row mapping (local camelCase ↔ server snake_case) ---------- */

const COLUMNS: Record<SyncedTable, string[]> = {
  teams: ["id", "name", "category", "gender", "season", "createdAt"],
  players: ["id", "teamId", "name", "number", "position", "birthYear", "heightCm", "active", "prevId", "createdAt"],
  practices: ["id", "teamId", "date", "title", "durationMin", "intensity", "notes", "createdAt"],
  attendance: ["id", "teamId", "practiceId", "playerId", "status", "note"],
  games: ["id", "teamId", "date", "opponent", "home", "competition", "periods", "periodMinutes", "video", "createdAt"],
  events: ["id", "teamId", "gameId", "side", "playerId", "type", "period", "videoTs", "x", "y", "meta", "createdAt"],
  goals: ["id", "teamId", "playerId", "metric", "target", "title", "dueDate", "active", "createdAt"],
  agenda: ["id", "teamId", "kind", "time", "meetTime", "location", "callup", "published", "plan", "note", "rotation"],
  rsvps: ["id", "teamId", "refId", "playerId", "status", "note", "answeredAt"],
  feedback: ["id", "teamId", "playerId", "gameId", "clipStart", "clipEnd", "eventIds", "text", "author", "report", "createdAt"],
  seen: ["id", "teamId", "playerId", "seenAt"],
  drills: ["id", "teamId", "name", "focus", "minutes", "description", "createdAt"],
  scouting: ["id", "teamId", "name", "notes", "keyPlayers", "editedAt"],
  notes: ["id", "teamId", "gameId", "videoTs", "period", "text", "author", "createdAt"],
  wellness: ["id", "teamId", "playerId", "kind", "refId", "date", "rpe", "minutes", "status", "note", "answeredAt"],
  measurements: ["id", "teamId", "playerId", "type", "value", "date", "sessionId", "attempts", "base", "evaluator", "protocolOk", "notes", "fromTeam", "createdAt"],
};
// tables added after the first release: if the server hasn't been migrated yet, skip them
// quietly (their changes stay queued) instead of breaking the whole sync
const OPTIONAL: SyncedTable[] = ["goals", "agenda", "rsvps", "feedback", "seen", "drills", "scouting", "notes", "wellness", "measurements"];
const missingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /could not find the table|does not exist/i.test(e.message ?? ""));
const unavailable = new Set<SyncedTable>();
// coach notes live in separate tables that players cannot read
const PRIVATE: Partial<Record<SyncedTable, { table: string; key: string }>> = {
  players: { table: "players_private", key: "player_id" },
  games: { table: "games_private", key: "game_id" },
};

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function toRow(table: SyncedTable, obj: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of COLUMNS[table]) row[snake(c)] = obj[c] === undefined ? null : obj[c];
  return row;
}

function fromRow(row: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "updated_at" || k === "created_by") continue;
    if (v !== null) obj[camel(k)] = v;
  }
  return obj;
}

/* ---------- status store ---------- */

export interface SyncStatus {
  state: "off" | "idle" | "syncing" | "offline" | "error";
  pending: number;
  lastSync?: number;
  error?: string;
}
let status: SyncStatus = { state: "off", pending: 0 };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); };
export const syncStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => status,
};

/* ---------- engine ---------- */

let client: SupabaseClient | null = null;
let userId: string | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

const meta = {
  get: async <T,>(key: string, fallback: T): Promise<T> => ((await db.meta.get(key))?.value as T) ?? fallback,
  set: (key: string, value: unknown) => db.meta.put({ key, value }),
};

const isNetworkError = (e: unknown) => {
  const msg = String((e as { message?: string })?.message ?? e);
  return /fetch|network|Failed to|timeout|ECONN/i.test(msg);
};

async function refreshPending() {
  setStatus({ pending: await db.outbox.count() });
}

export function scheduleSync(delay = 800) {
  if (!client || !userId) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow() {
  if (!client || !userId) return;
  if (running) { again = true; return; }
  if (typeof navigator !== "undefined" && !navigator.onLine) { setStatus({ state: "offline" }); await refreshPending(); return; }
  running = true;
  setStatus({ state: "syncing", error: undefined });
  try {
    await flush();
    await pull();
    await refreshPending();
    setStatus({ state: "idle", lastSync: Date.now() });
    void import("./push").then((m) => m.flushPush()); // queued notifications
  } catch (e) {
    await refreshPending();
    setStatus(isNetworkError(e) ? { state: "offline" } : { state: "error", error: (e as Error).message ?? String(e) });
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(300); }
  }
}

/** Start syncing for a signed-in user. Clears local data if a different user was signed in on this browser. */
export async function startSync(sb: SupabaseClient, uid: string) {
  client = sb;
  const prev = await meta.get<string | null>("userId", null);
  if (prev && prev !== uid) {
    const { clearAllLocal } = await import("./db");
    await clearAllLocal();
  }
  userId = uid;
  await meta.set("userId", uid);
  setEnqueueListener(() => { void refreshPending(); scheduleSync(); });
  if (interval) clearInterval(interval);
  interval = setInterval(() => void syncNow(), 30000);
  if (typeof window !== "undefined") {
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
  }
  await syncNow();
  void import("./push").then((m) => m.refreshPushSubscription());
}

const onWake = () => scheduleSync(200);

export function stopSync() {
  client = null;
  userId = null;
  if (interval) clearInterval(interval);
  if (timer) clearTimeout(timer);
  if (typeof window !== "undefined") {
    window.removeEventListener("online", onWake);
    window.removeEventListener("focus", onWake);
  }
  setEnqueueListener(() => {});
  setStatus({ state: "off", pending: 0 });
}

/* ---------- push ---------- */

async function flush() {
  const entries = await db.outbox.orderBy("seq").toArray();
  if (!entries.length || !client) return;
  const maxSeq = entries[entries.length - 1].seq!;

  // last op per row wins
  const last = new Map<string, OutboxEntry>();
  for (const e of entries) last.set(`${e.table}:${e.rowId}`, e);
  const ups = new Map<SyncedTable, string[]>();
  const dels = new Map<SyncedTable, string[]>();
  for (const e of last.values()) {
    const m = e.op === "upsert" ? ups : dels;
    m.set(e.table, [...(m.get(e.table) ?? []), e.rowId]);
  }

  const rejected: string[] = [];
  const skipped = new Set<SyncedTable>();

  for (const table of SYNCED_TABLES) {
    const ids = ups.get(table);
    if (!ids?.length) continue;
    const objs = (await db.table(table).bulkGet(ids)).filter(Boolean) as Record<string, unknown>[];
    for (let i = 0; i < objs.length; i += 500) {
      const chunk = objs.slice(i, i + 500);
      let rows = chunk.map((o) => toRow(table, o));
      let { error } = await client.from(table).upsert(rows, { onConflict: "id" });
      // server not migrated yet for a new column (e.g. agenda.rotation): send the row without it
      for (let tries = 0; error && tries < 3; tries++) {
        const col = (error.code === "PGRST204" || /column/i.test(error.message ?? "")) && error.message?.match(/'([a-z_]+)' column/)?.[1];
        if (!col || !(col in rows[0])) break;
        rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== col)));
        ({ error } = await client.from(table).upsert(rows, { onConflict: "id" }));
      }
      if (error) {
        if (isNetworkError(error)) throw error;
        if (OPTIONAL.includes(table) && missingTable(error)) { unavailable.add(table); skipped.add(table); break; }
        // permission / validation problems: don't retry forever
        rejected.push(`${table}: ${error.message}`);
        continue;
      }
      const priv = PRIVATE[table];
      if (priv) {
        const rows = chunk.map((o) => ({ [priv.key]: o.id, team_id: o.teamId, notes: (o.notes as string | undefined) ?? null }));
        const { error: pe } = await client.from(priv.table).upsert(rows, { onConflict: priv.key });
        if (pe && isNetworkError(pe)) throw pe;
      }
    }
  }

  for (const table of [...SYNCED_TABLES].reverse()) {
    const ids = dels.get(table);
    if (!ids?.length) continue;
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await client.from(table).delete().in("id", ids.slice(i, i + 100));
      if (error) {
        if (isNetworkError(error)) throw error;
        if (OPTIONAL.includes(table) && missingTable(error)) { unavailable.add(table); skipped.add(table); break; }
        rejected.push(`${table}: ${error.message}`);
      }
    }
  }

  // entries of tables the server doesn't have yet stay queued for after the migration
  await db.outbox.where("seq").belowOrEqual(maxSeq).and((e) => !skipped.has(e.table)).delete();
  if (rejected.length) setStatus({ error: `Algumas alterações foram recusadas pelo servidor (${rejected[0]})` });
}

/* ---------- pull ---------- */

async function fetchAll(table: string, since: string | null, teamIds: string[]) {
  const out: Record<string, unknown>[] = [];
  if (!client || !teamIds.length) return out;
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select("*").in("team_id", teamIds).order("updated_at", { ascending: true }).range(from, from + 999);
    if (since) q = q.gt("updated_at", since);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function maxTs(rows: Record<string, unknown>[], prev?: string) {
  let best = prev ?? "";
  for (const r of rows) {
    const ts = r.updated_at as string;
    if (!best || Date.parse(ts) > Date.parse(best)) best = ts;
  }
  return best;
}

async function pull() {
  if (!client) return;
  const pendingIds = new Set((await db.outbox.toArray()).map((e) => `${e.table}:${e.rowId}`));

  // teams: full list every time (small)
  const { data: teams, error } = await client.from("teams").select("*");
  if (error) throw error;
  const serverTeamIds = (teams ?? []).map((t) => t.id as string);
  const seen = new Set(await meta.get<string[]>("seenTeams", []));
  const localTeams = await db.teams.toArray();
  // a team we had seen on the server and is gone → deleted or access removed
  for (const t of localTeams) {
    if (seen.has(t.id) && !serverTeamIds.includes(t.id) && !pendingIds.has(`teams:${t.id}`)) await purgeTeamLocal(t.id);
  }
  await localOnly(["teams"], async () => {
    const rows = (teams ?? []).filter((t) => !pendingIds.has(`teams:${t.id}`)).map(fromRow);
    await db.teams.bulkPut(rows as never[]);
  });
  const newTeams = serverTeamIds.filter((id) => !seen.has(id));
  serverTeamIds.forEach((id) => seen.add(id));
  await meta.set("seenTeams", [...seen]);

  // rows changed since the last pull (full pull for teams we just gained access to)
  const since = await meta.get<Record<string, string>>("since", {});
  const nextSince = { ...since };
  const knownTeams = serverTeamIds.filter((id) => !newTeams.includes(id));

  for (const table of SYNCED_TABLES.filter((t) => t !== "teams")) {
    let rows: Record<string, unknown>[];
    try {
      rows = [
        ...(await fetchAll(table, since[table] ?? null, knownTeams)),
        ...(await fetchAll(table, null, newTeams)),
      ];
      unavailable.delete(table);
    } catch (e) {
      if (OPTIONAL.includes(table) && missingTable(e as { code?: string; message?: string })) { unavailable.add(table); continue; }
      throw e;
    }
    if (rows.length) {
      nextSince[table] = maxTs(rows, since[table]);
      await localOnly([table], async () => {
        const fresh = rows.filter((r) => !pendingIds.has(`${table}:${r.id}`)).map(fromRow);
        // keep local-only fields (e.g. notes merged below) when updating
        const existing = new Map(((await db.table(table).bulkGet(fresh.map((r) => r.id as string))) as (Record<string, unknown> | undefined)[])
          .filter(Boolean).map((o) => [o!.id as string, o!]));
        await db.table(table).bulkPut(fresh.map((r) => {
          const prev = existing.get(r.id as string);
          return PRIVATE[table as SyncedTable] && prev?.notes !== undefined ? { notes: prev.notes, ...r } : r;
        }));
      });
    }
    const priv = PRIVATE[table];
    if (priv) {
      const prows = [
        ...(await fetchAll(priv.table, since[priv.table] ?? null, knownTeams)),
        ...(await fetchAll(priv.table, null, newTeams)),
      ];
      if (prows.length) {
        nextSince[priv.table] = maxTs(prows, since[priv.table]);
        await localOnly([table], async () => {
          for (const r of prows) {
            const id = r[priv.key] as string;
            if (pendingIds.has(`${table}:${id}`)) continue;
            await db.table(table).update(id, { notes: (r.notes as string | null) ?? undefined });
          }
        });
      }
    }
  }

  // deletions
  const lastTomb = await meta.get<number>("lastTomb", 0);
  const { data: tombs, error: te } = await client.from("tombstones").select("*").gt("id", lastTomb).order("id").limit(5000);
  if (te) throw te;
  if (tombs?.length) {
    for (const t of tombs) {
      const table = t.table_name as string;
      if (table === "teams") {
        if (localTeams.some((lt) => lt.id === t.row_id) || serverTeamIds.includes(t.row_id)) await purgeTeamLocal(t.row_id);
      } else if ((SYNCED_TABLES as string[]).includes(table) && !pendingIds.has(`${table}:${t.row_id}`)) {
        await localOnly([table], () => db.table(table).delete(t.row_id));
      }
    }
    await meta.set("lastTomb", tombs[tombs.length - 1].id);
  }
  await meta.set("since", nextSince);
}

/** Queue every row of a local-only team for upload (used for data created before signing in). */
export async function uploadTeam(teamId: string) {
  const entries: OutboxEntry[] = [{ table: "teams", rowId: teamId, teamId, op: "upsert" }];
  for (const table of SYNCED_TABLES.filter((t) => t !== "teams")) {
    const ids = (await db.table(table).where("teamId").equals(teamId).primaryKeys()) as string[];
    ids.forEach((id) => entries.push({ table, rowId: id, teamId, op: "upsert" }));
  }
  await db.outbox.bulkAdd(entries);
  await refreshPending();
  scheduleSync(100);
}

export async function seenTeamIds() {
  return new Set(await meta.get<string[]>("seenTeams", []));
}
