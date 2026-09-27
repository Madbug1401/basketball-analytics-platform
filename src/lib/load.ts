"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, today } from "./db";
import { gameStats } from "./stats";
import type { Attendance, Availability, Game, GameEvent, ID, Player, Practice, Wellness } from "./types";

/* Training load (session-RPE): effort 1–10 × minutes, reported by each player after a practice or game.
   Acute load = last 7 days; chronic = weekly average of the last 28 days. A week much heavier than
   usual (ratio > 1.5) is the classic warning sign for fatigue/injury risk. */

export const RPE_LABEL = ["", "Muito leve", "Leve", "Moderado", "Algo duro", "Duro", "Duro+", "Muito duro", "Muito duro+", "Quase máximo", "Máximo"];
export const rpeColor = (v: number) => (v <= 3 ? "bg-good/70" : v <= 6 ? "bg-brand/70" : "bg-bad/80");

export const DEFAULT_PRACTICE_MIN = 90;
export const sessionId = (refId: ID, playerId: ID) => `${refId}:${playerId}`;
export const statusId = (playerId: ID) => `status:${playerId}`;
export const load = (w: Wellness) => (w.rpe ?? 0) * (w.minutes ?? 0);

const addDays = (d: string, n: number) => {
  const t = new Date(d + "T12:00");
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};

export interface PlayerLoad {
  player: Player;
  acute: number; // last 7 days
  chronic: number; // weekly average, last 28 days
  ratio: number | null;
  sessions7: number;
  lastRpe?: number;
  lastDate?: string;
  highStreak: boolean; // last two sessions at 8+
  status?: Wellness; // availability
  daily: number[]; // load per day, last 14 days (oldest first)
}

export interface Session { id: ID; kind: "practice" | "game"; date: string; title: string; minutes: number }

export function playerLoads(players: Player[], rows: Wellness[], day = today()): PlayerLoad[] {
  const from7 = addDays(day, -6), from28 = addDays(day, -27), from14 = addDays(day, -13);
  return players.map((player) => {
    const mine = rows.filter((w) => w.playerId === player.id);
    const sessions = mine.filter((w) => w.kind === "session" && w.rpe && w.date <= day).sort((a, b) => a.date.localeCompare(b.date) || a.answeredAt - b.answeredAt);
    const acute = sessions.filter((w) => w.date >= from7).reduce((a, w) => a + load(w), 0);
    const chronic = sessions.filter((w) => w.date >= from28).reduce((a, w) => a + load(w), 0) / 4;
    const daily = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(from14, i);
      return sessions.filter((w) => w.date === d).reduce((a, w) => a + load(w), 0);
    });
    const last = sessions[sessions.length - 1];
    const prev = sessions[sessions.length - 2];
    return {
      player, acute, chronic,
      ratio: chronic > 0 ? acute / chronic : null,
      sessions7: sessions.filter((w) => w.date >= from7).length,
      lastRpe: last?.rpe, lastDate: last?.date,
      highStreak: !!last && !!prev && (last.rpe ?? 0) >= 8 && (prev.rpe ?? 0) >= 8,
      status: mine.find((w) => w.kind === "status"),
      daily,
    };
  });
}

/** Weekly team load (average per player who answered), last n weeks, oldest first. */
export function teamWeeks(rows: Wellness[], n = 8, day = today()) {
  return Array.from({ length: n }, (_, i) => {
    const end = addDays(day, -7 * (n - 1 - i));
    const start = addDays(end, -6);
    const ws = rows.filter((w) => w.kind === "session" && w.rpe && w.date >= start && w.date <= end);
    const who = new Set(ws.map((w) => w.playerId)).size;
    return { start, end, avg: who ? ws.reduce((a, w) => a + load(w), 0) / who : 0, answers: ws.length };
  });
}

export function ratioTone(r: number | null) {
  if (r === null) return "";
  if (r > 1.5) return "text-bad";
  if (r > 1.3) return "text-brand";
  if (r < 0.8) return "text-opp";
  return "text-good";
}

/** Recent practices/games (last 3 days) this player took part in and hasn't rated yet. */
export function pendingSessions(opts: {
  playerId: ID; practices: Practice[]; games: Game[]; attendance: Attendance[]; events: GameEvent[];
  callups: Map<ID, ID[]>; answered: Set<ID>; day?: string;
}): Session[] {
  const day = opts.day ?? today();
  const since = addDays(day, -3);
  const out: Session[] = [];
  for (const p of opts.practices) {
    if (p.date < since || p.date > day) continue;
    const att = opts.attendance.find((a) => a.practiceId === p.id && a.playerId === opts.playerId);
    if (att && att.status !== "present" && att.status !== "late") continue;
    if (!att && opts.attendance.some((a) => a.practiceId === p.id)) continue; // attendance taken, not there
    if (opts.answered.has(sessionId(p.id, opts.playerId))) continue;
    out.push({ id: p.id, kind: "practice", date: p.date, title: p.title || "Treino", minutes: p.durationMin ?? DEFAULT_PRACTICE_MIN });
  }
  for (const g of opts.games) {
    if (g.date < since || g.date > day) continue;
    if (opts.answered.has(sessionId(g.id, opts.playerId))) continue;
    const evs = opts.events.filter((e) => e.gameId === g.id);
    const played = evs.length ? gameStats(evs, g.periods, g.periodMinutes).players.get(opts.playerId) : undefined;
    const called = opts.callups.get(g.id)?.includes(opts.playerId);
    if (!played?.gp && !called) continue;
    out.push({ id: g.id, kind: "game", date: g.date, title: `Jogo ${g.home ? "vs" : "@"} ${g.opponent}`, minutes: Math.max(10, Math.round(played?.min || g.periods * g.periodMinutes * 0.5)) + 20 /* warm-up */ });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function saveSession(teamId: ID, playerId: ID, s: Session, rpe: number) {
  return db.wellness.put({ id: sessionId(s.id, playerId), teamId, playerId, kind: "session", refId: s.id, date: s.date, rpe, minutes: s.minutes, answeredAt: Date.now() });
}

export function saveStatus(teamId: ID, playerId: ID, status: Availability, note?: string) {
  return db.wellness.put({ id: statusId(playerId), teamId, playerId, kind: "status", date: today(), status, note: note || undefined, answeredAt: Date.now() });
}

/** Everything the load page needs. */
export function useLoadData(teamId?: string) {
  return useLiveQuery(async () => {
    if (!teamId) return undefined;
    const [players, rows, practices] = await Promise.all([
      db.players.where("teamId").equals(teamId).filter((p) => p.active).sortBy("number"),
      db.wellness.where("teamId").equals(teamId).toArray(),
      db.practices.where("teamId").equals(teamId).sortBy("date"),
    ]);
    return { players, rows, practices };
  }, [teamId]);
}

export const shortDate = (d: string) => new Date(d + "T12:00").toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
