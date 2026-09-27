"use client";

import { useState } from "react";
import { db, today, uid } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAccess } from "@/lib/auth";
import { isUpcoming, useAgenda } from "@/lib/agenda";
import { AgendaCard } from "@/components/AgendaCard";
import { t } from "@/lib/i18n";

export default function AgendaPage() {
  const { team } = useTeam();
  const access = useAccess(team?.id);
  const data = useAgenda(team?.id);
  const [tab, setTab] = useState<"next" | "past">("next");
  const [adding, setAdding] = useState(false);
  if (!team || !data) return null;

  const upcoming = data.items.filter(isUpcoming);
  const past = data.items.filter((i) => !isUpcoming(i)).reverse().slice(0, 30);
  const list = tab === "next" ? upcoming : past;
  const pending = access.playerId ? upcoming.filter((i) => !i.rsvps.has(access.playerId!)).length : 0;

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Agenda")}</h1>
          <p className="text-sm text-muted">
            {access.isPlayer
              ? pending ? (pending === 1 ? t("Tens {n} evento por responder.", { n: pending }) : t("Tens {n} eventos por responder.", { n: pending })) : t("Respondeste a tudo ✓")
              : t("Treinos e jogos, convocatórias e quem vem.")}
          </p>
        </div>
        {access.canEdit && <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t("Fechar") : t("+ Adicionar")}</button>}
      </div>

      {adding && access.canEdit && <QuickAdd teamId={team.id} onDone={() => setAdding(false)} />}

      <div className="flex gap-1">
        <button className={`btn ${tab === "next" ? "btn-primary" : ""}`} onClick={() => setTab("next")}>{t("Próximos ({n})", { n: upcoming.length })}</button>
        <button className={`btn ${tab === "past" ? "btn-primary" : ""}`} onClick={() => setTab("past")}>{t("Anteriores")}</button>
      </div>

      <div className="grid gap-3">
        {list.map((it) => (
          <AgendaCard key={it.id} it={it} players={data.players} teamId={team.id} teamName={`${team.name} ${team.category}`}
            canEdit={access.canEdit} myPlayerId={access.isPlayer ? access.playerId : undefined} />
        ))}
        {list.length === 0 && (
          <div className="card p-8 text-center text-sm text-muted">
            {tab === "next" ? (access.canEdit ? t("Nada marcado. Adiciona o próximo treino ou jogo.") : t("Ainda não há treinos nem jogos marcados.")) : t("Sem eventos anteriores.")}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAdd({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const [kind, setKind] = useState<"practice" | "game">("practice");
  const [f, setF] = useState({ date: today(), time: "18:00", location: "", opponent: "", home: true, competition: "Regional", duration: 90 });
  const [err, setErr] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "game" && !f.opponent.trim()) return setErr(t("Escreve o adversário."));
    const id = uid();
    if (kind === "game") {
      await db.games.add({ id, teamId, date: f.date, opponent: f.opponent.trim(), home: f.home, competition: f.competition || undefined, periods: 4, periodMinutes: 10, video: { kind: "none" }, createdAt: Date.now() });
    } else {
      const n = await db.practices.where("teamId").equals(teamId).count();
      await db.practices.add({ id, teamId, date: f.date, title: t("Treino #{n}", { n: n + 1 }), durationMin: f.duration, createdAt: Date.now() });
    }
    await db.agenda.put({ id, teamId, kind, time: f.time || undefined, location: f.location.trim() || undefined });
    onDone();
  };
  return (
    <form onSubmit={save} className="card grid gap-3 p-4">
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className={`btn ${kind === "practice" ? "btn-primary" : ""}`} onClick={() => setKind("practice")}>{t("Treino")}</button>
        <button type="button" className={`btn ${kind === "game" ? "btn-primary" : ""}`} onClick={() => setKind("game")}>{t("Jogo")}</button>
      </div>
      {kind === "game" && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div><label className="label">{t("Adversário")}</label><input className="input" value={f.opponent} onChange={(e) => setF({ ...f, opponent: e.target.value })} /></div>
          <div><label className="label">{t("Local")}</label>
            <select className="input" value={f.home ? "1" : "0"} onChange={(e) => setF({ ...f, home: e.target.value === "1" })}><option value="1">{t("Casa")}</option><option value="0">{t("Fora")}</option></select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">{t("Data")}</label><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="label">{t("Hora")}</label><input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div><label className="label">{t("Pavilhão / local")}</label><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        {kind === "practice"
          ? <div><label className="label">{t("Minutos")}</label><input className="input w-24" inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) || 90 })} /></div>
          : <div><label className="label">{t("Competição")}</label><input className="input w-32" value={f.competition} onChange={(e) => setF({ ...f, competition: e.target.value })} /></div>}
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
      <button className="btn btn-primary">{t("Adicionar à agenda")}</button>
    </form>
  );
}
