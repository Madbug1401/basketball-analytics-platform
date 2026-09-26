"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { addLines, emptyLine, gameStats, type GameStats, type Line } from "./stats";
import type { Game, GameEvent, ID, Player } from "./types";

export interface SeasonData {
  players: Player[];
  games: { game: Game; stats: GameStats; events: GameEvent[] }[]; // chronological, only games with events
  totals: Map<ID, Line>;
  team: Line;
  opp: Line;
  record: { w: number; l: number };
  attendancePct: Map<ID, number | null>;
}

export function useSeason(teamId?: string): SeasonData | undefined {
  return useLiveQuery(async () => {
    if (!teamId) return undefined;
    const [players, games, events, attendance] = await Promise.all([
      db.players.where("teamId").equals(teamId).sortBy("number"),
      db.games.where("teamId").equals(teamId).sortBy("date"),
      db.events.where("teamId").equals(teamId).toArray(),
      db.attendance.where("teamId").equals(teamId).toArray(),
    ]);
    const byGame = new Map<ID, GameEvent[]>();
    events.forEach((e) => byGame.set(e.gameId, [...(byGame.get(e.gameId) ?? []), e]));

    const totals = new Map<ID, Line>();
    const team = emptyLine();
    const opp = emptyLine();
    const record = { w: 0, l: 0 };
    const played: SeasonData["games"] = [];
    for (const game of games) {
      const ev = byGame.get(game.id);
      if (!ev?.length) continue;
      const stats = gameStats(ev, game.periods);
      played.push({ game, stats, events: ev });
      stats.players.forEach((l, pid) => totals.set(pid, addLines(totals.get(pid) ?? emptyLine(), l)));
      addLines(team, stats.us);
      addLines(opp, stats.opp);
      team.gp = opp.gp = played.length;
      if (stats.us.pts > stats.opp.pts) record.w++;
      else if (stats.us.pts < stats.opp.pts) record.l++;
    }

    const attendancePct = new Map<ID, number | null>();
    for (const p of players) {
      const mine = attendance.filter((a) => a.playerId === p.id && a.status !== "excused");
      const present = mine.filter((a) => a.status === "present" || a.status === "late").length;
      attendancePct.set(p.id, mine.length ? Math.round((present / mine.length) * 100) : null);
    }
    return { players, games: played, totals, team, opp, record, attendancePct };
  }, [teamId]);
}
