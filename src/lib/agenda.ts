"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, today } from "./db";
import type { Agenda, Game, ID, Player, Practice, Rsvp } from "./types";
import { locale, t } from "./i18n";

export interface AgendaItem {
  id: ID;
  kind: "game" | "practice";
  date: string;
  time?: string;
  title: string;
  game?: Game;
  practice?: Practice;
  info?: Agenda;
  rsvps: Map<ID, Rsvp>; // by player
  hasEvents?: boolean;
}

export interface AgendaData {
  items: AgendaItem[];
  players: Player[];
}

/** Games and practices of a team with their agenda info and the players' answers. */
export function useAgenda(teamId?: string): AgendaData | undefined {
  return useLiveQuery(async () => {
    if (!teamId) return undefined;
    const [games, practices, agenda, rsvps, players, events] = await Promise.all([
      db.games.where("teamId").equals(teamId).toArray(),
      db.practices.where("teamId").equals(teamId).toArray(),
      db.agenda.where("teamId").equals(teamId).toArray(),
      db.rsvps.where("teamId").equals(teamId).toArray(),
      db.players.where("teamId").equals(teamId).filter((p) => p.active).sortBy("number"),
      db.events.orderBy("gameId").uniqueKeys(),
    ]);
    const info = new Map(agenda.map((a) => [a.id, a]));
    const byRef = new Map<ID, Map<ID, Rsvp>>();
    for (const r of rsvps) {
      const m = byRef.get(r.refId) ?? new Map<ID, Rsvp>();
      m.set(r.playerId, r);
      byRef.set(r.refId, m);
    }
    const withEvents = new Set(events.map(String));
    const items: AgendaItem[] = [
      ...games.map((g) => ({
        id: g.id, kind: "game" as const, date: g.date, time: info.get(g.id)?.time,
        title: `${g.home ? "vs" : "@"} ${g.opponent}`, game: g, info: info.get(g.id), rsvps: byRef.get(g.id) ?? new Map(), hasEvents: withEvents.has(g.id),
      })),
      ...practices.map((p) => ({
        id: p.id, kind: "practice" as const, date: p.date, time: info.get(p.id)?.time,
        title: p.title || t("Treino"), practice: p, info: info.get(p.id), rsvps: byRef.get(p.id) ?? new Map(),
      })),
    ];
    items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
    return { items, players };
  }, [teamId]);
}

export const isUpcoming = (it: AgendaItem) => it.date >= today();

export function dayLabel(date: string) {
  const d = new Date(date + "T12:00");
  const now = today();
  const diff = Math.round((Date.parse(date + "T12:00") - Date.parse(now + "T12:00")) / 86400000);
  const base = d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" });
  if (diff === 0) return t("Hoje · {date}", { date: base });
  if (diff === 1) return t("Amanhã · {date}", { date: base });
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Players expected at this item: the call-up for games (if any), everyone for practices. */
export function expected(it: AgendaItem, players: Player[]) {
  if (it.kind === "game" && it.info?.callup?.length) return players.filter((p) => it.info!.callup!.includes(p.id));
  return players;
}

export function rsvpCounts(it: AgendaItem, players: Player[]) {
  const list = expected(it, players);
  const c = { yes: 0, maybe: 0, no: 0, none: 0 };
  for (const p of list) {
    const r = it.rsvps.get(p.id);
    if (r) c[r.status]++; else c.none++;
  }
  return c;
}

export function callupText(it: AgendaItem, players: Player[], teamName: string, origin: string) {
  const called = it.kind === "game" && it.info?.callup?.length ? players.filter((p) => it.info!.callup!.includes(p.id)) : [];
  const when = [dayLabel(it.date), it.info?.time, it.info?.meetTime ? t("concentração {time}", { time: it.info.meetTime }) : ""].filter(Boolean).join(" · ");
  const lines = [
    it.kind === "game" ? t("🏀 *Convocatória — {team}*", { team: teamName }) : t("🏀 *Treino — {team}*", { team: teamName }),
    it.kind === "game" ? `${it.title}${it.game?.competition ? ` (${it.game.competition})` : ""}` : it.title,
    when,
  ];
  if (it.info?.location) lines.push(`📍 ${it.info.location}`);
  if (it.info?.note) lines.push("", it.info.note);
  if (called.length) lines.push("", t("*Convocados:*"), ...called.map((p) => `#${p.number} ${p.name}`));
  lines.push("", t("Confirmem na app: {url}", { url: `${origin}/agenda` }));
  return lines.join("\n");
}
