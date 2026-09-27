"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, today } from "@/lib/db";
import { pendingSessions, RPE_LABEL, rpeColor, saveSession, saveStatus, shortDate, statusId, type Session } from "@/lib/load";
import { notify } from "@/lib/push";
import { AVAILABILITY_LABEL, type Availability, type ID } from "@/lib/types";
import { askText } from "./Dialog";

const ST_STYLE: Record<Availability, string> = {
  ok: "border-good bg-good/15 text-good",
  limited: "border-brand bg-brand/15 text-brand",
  out: "border-bad bg-bad/15 text-bad",
};

/** 1–10 effort buttons. */
export function RpePicker({ value, onPick, compact }: { value?: number; onPick: (v: number) => void; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-5 gap-1 ${compact ? "" : "sm:grid-cols-10"}`} role="radiogroup" aria-label="Esforço de 1 a 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
        <button key={v} role="radio" aria-checked={value === v} title={RPE_LABEL[v]} onClick={() => onPick(v)}
          className={`min-h-10 rounded-lg border font-mono text-sm font-semibold ${value === v ? `${rpeColor(v)} border-transparent text-black` : "border-line hover:bg-panel-2"}`}>
          {v}
        </button>
      ))}
    </div>
  );
}

/** Player dashboard: rate the last practice/game and say if they are available. */
export function WellnessCheck({ teamId, playerId }: { teamId: ID; playerId: ID }) {
  const data = useLiveQuery(async () => {
    const since = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    const [practices, games, attendance, mine, agenda] = await Promise.all([
      db.practices.where("teamId").equals(teamId).filter((p) => p.date >= since).toArray(),
      db.games.where("teamId").equals(teamId).filter((g) => g.date >= since).toArray(),
      db.attendance.where("playerId").equals(playerId).toArray(),
      db.wellness.where("playerId").equals(playerId).toArray(),
      db.agenda.where("teamId").equals(teamId).filter((a) => a.kind === "game").toArray(),
    ]);
    const events = games.length ? await db.events.where("gameId").anyOf(games.map((g) => g.id)).toArray() : [];
    return { practices, games, attendance, mine, events, callups: new Map(agenda.filter((a) => a.published).map((a) => [a.id, a.callup ?? []])) };
  }, [teamId, playerId]);
  const [justRated, setJustRated] = useState<{ s: Session; v: number } | null>(null);
  if (!data) return null;

  const status = data.mine.find((w) => w.id === statusId(playerId));
  const pending = pendingSessions({ playerId, practices: data.practices, games: data.games, attendance: data.attendance, events: data.events, callups: data.callups, answered: new Set(data.mine.map((w) => w.id)) });
  const s = pending[0];

  const setStatus = async (st: Availability) => {
    let note: string | undefined;
    if (st !== "ok") {
      const v = await askText(st === "out" ? "O que se passa? (só a equipa técnica vê)" : "Porquê? (só a equipa técnica vê)", { confirmText: "Guardar" });
      if (v === null) return;
      note = v.trim() || undefined;
    }
    await saveStatus(teamId, playerId, st, note);
    if (st !== "ok" && status?.status !== st) {
      const p = await db.players.get(playerId);
      void notify({ teamId, staff: true, title: `${p ? `#${p.number} ${p.name.split(" ")[0]}` : "Jogador"}: ${AVAILABILITY_LABEL[st].toLowerCase()}`, body: note ?? "Atualizou a disponibilidade.", url: "/carga", tag: `status-${playerId}` });
    }
  };

  return (
    <section className="card grid gap-3 p-4">
      {s ? (
        <div>
          <div className="font-semibold">Como foi o {s.kind === "game" ? "jogo" : "treino"} de {shortDate(s.date)}?</div>
          <p className="mb-2 text-xs text-muted">{s.title} · 1 = muito leve, 10 = o máximo que consegues. Ajuda o treinador a gerir o cansaço.</p>
          <RpePicker onPick={async (v) => { await saveSession(teamId, playerId, s, v); setJustRated({ s, v }); }} />
        </div>
      ) : justRated ? (
        <p className="text-sm text-good">✓ Obrigado! {justRated.s.kind === "game" ? "Jogo" : "Treino"} de {shortDate(justRated.s.date)}: {justRated.v} — {RPE_LABEL[justRated.v].toLowerCase()}.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Como estás?</span>
        {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((st) => (
          <button key={st} onClick={() => setStatus(st)} aria-pressed={(status?.status ?? "ok") === st}
            className={`min-h-9 rounded-full border px-3 text-sm ${(status?.status ?? "ok") === st ? ST_STYLE[st] : "border-line text-muted"}`}>
            {AVAILABILITY_LABEL[st]}
          </button>
        ))}
        {status?.status && status.status !== "ok" && status.date < today() && <span className="text-[11px] text-muted">desde {shortDate(status.date)} — atualiza quando melhorares</span>}
      </div>
    </section>
  );
}
