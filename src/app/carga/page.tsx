"use client";

import Link from "next/link";
import { useState } from "react";
import { today } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { StaffOnly } from "@/components/Guard";
import { Kpi } from "@/components/Kpi";
import { DEFAULT_PRACTICE_MIN, playerLoads, ratioTone, RPE_LABEL, rpeColor, saveSession, sessionId, shortDate, teamWeeks, useLoadData, type PlayerLoad } from "@/lib/load";
import { AVAILABILITY_LABEL, type Practice } from "@/lib/types";

export default function LoadPageGuarded() {
  return <StaffOnly><LoadPage /></StaffOnly>;
}

function flag(l: PlayerLoad) {
  if (l.status?.status === "out") return { tone: "text-bad", text: "Indisponível" };
  if (l.ratio !== null && l.ratio > 1.5) return { tone: "text-bad", text: "Semana muito mais pesada que o normal" };
  if (l.highStreak) return { tone: "text-brand", text: "Esforço 8+ nas duas últimas sessões" };
  if (l.ratio !== null && l.ratio > 1.3) return { tone: "text-brand", text: "Carga a subir" };
  if (l.status?.status === "limited") return { tone: "text-brand", text: "Condicionado" };
  if (!l.lastDate) return { tone: "text-muted", text: "Sem respostas" };
  return null;
}

function LoadPage() {
  const { team } = useTeam();
  const data = useLoadData(team?.id);
  const [entry, setEntry] = useState(false);
  if (!team || !data) return null;
  const loads = playerLoads(data.players, data.rows);
  const weeks = teamWeeks(data.rows);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.avg));
  const unavailable = loads.filter((l) => l.status?.status && l.status.status !== "ok");
  const answered7 = loads.reduce((a, l) => a + l.sessions7, 0);
  const alerts = loads.filter((l) => (l.ratio !== null && l.ratio > 1.5) || l.highStreak).length;
  const maxDay = Math.max(1, ...loads.flatMap((l) => l.daily));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Carga e disponibilidade</h1>
        <p className="text-sm text-muted">Depois de cada treino/jogo, os jogadores dizem o esforço (1–10) na app. Carga = esforço × minutos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Indisponíveis / condicionados" value={`${unavailable.filter((l) => l.status?.status === "out").length} / ${unavailable.filter((l) => l.status?.status === "limited").length}`} />
        <Kpi label="Respostas (7 dias)" value={String(answered7)} sub={`${loads.filter((l) => l.sessions7 > 0).length} de ${loads.length} jogadores`} />
        <Kpi label="Carga média da semana" value={String(Math.round(weeks[weeks.length - 1]?.avg ?? 0))} sub={`semana anterior ${Math.round(weeks[weeks.length - 2]?.avg ?? 0)}`} />
        <Kpi label="Alertas de carga" value={String(alerts)} sub="subida brusca ou esforço alto seguido" />
      </div>

      {unavailable.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-line px-3 py-2"><h2 className="font-semibold">Quem não está a 100%</h2></div>
          <ul className="divide-y divide-line/60">
            {unavailable.map((l) => (
              <li key={l.player.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${l.status!.status === "out" ? "border-bad text-bad" : "border-brand text-brand"}`}>{AVAILABILITY_LABEL[l.status!.status!]}</span>
                <Link href={`/jogadores/${l.player.id}`} className="font-medium hover:text-brand">#{l.player.number} {l.player.name}</Link>
                <span className="min-w-0 flex-1 text-muted">{l.status!.note ?? ""}</span>
                <span className="text-xs text-muted">desde {shortDate(l.status!.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="font-semibold">Por jogador</h2>
          <button className={`btn px-2.5 py-1 text-xs ${entry ? "btn-primary" : ""}`} onClick={() => setEntry(!entry)}>{entry ? "Fechar" : "Registar esforço por jogador"}</button>
        </div>
        {entry && <StaffEntry practices={data.practices} loads={loads} teamId={team.id} rows={data.rows} />}
        <table className="tbl">
          <thead>
            <tr>
              <th>Jogador</th><th>Estado</th>
              <th title="Último esforço reportado (1–10)">Último</th>
              <th title="Carga dos últimos 7 dias">7 dias</th>
              <th title="Média semanal das últimas 4 semanas">Média/sem.</th>
              <th title="7 dias ÷ média semanal. 0,8–1,3 é o normal">Rácio</th>
              <th>14 dias</th><th>Atenção</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => {
              const f = flag(l);
              return (
                <tr key={l.player.id}>
                  <td className="whitespace-nowrap"><Link className="hover:text-brand" href={`/jogadores/${l.player.id}`}><b className="font-mono">#{l.player.number}</b> {l.player.name.split(" ")[0]}</Link></td>
                  <td className={`text-xs ${l.status?.status === "out" ? "text-bad" : l.status?.status === "limited" ? "text-brand" : "text-muted"}`}>{AVAILABILITY_LABEL[l.status?.status ?? "ok"]}</td>
                  <td className="whitespace-nowrap">{l.lastRpe ? <><span className={`mr-1 inline-block h-2 w-2 rounded-full ${rpeColor(l.lastRpe)}`} />{l.lastRpe} <span className="text-[10px] text-muted">{shortDate(l.lastDate!)}</span></> : "–"}</td>
                  <td className="font-mono">{l.acute ? Math.round(l.acute) : "–"}</td>
                  <td className="font-mono text-muted">{l.chronic ? Math.round(l.chronic) : "–"}</td>
                  <td className={`font-mono font-semibold ${ratioTone(l.ratio)}`}>{l.ratio === null ? "–" : l.ratio.toFixed(2).replace(".", ",")}</td>
                  <td>
                    <div className="flex h-6 items-end gap-px" aria-label="Carga diária nos últimos 14 dias">
                      {l.daily.map((v, i) => <span key={i} className={`w-1.5 rounded-sm ${v ? "bg-brand/80" : "bg-line"}`} style={{ height: `${v ? 4 + (v / maxDay) * 20 : 2}px` }} />)}
                    </div>
                  </td>
                  <td className={`text-xs ${f?.tone ?? ""}`}>{f?.text ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Carga semanal da equipa</h2>
        <div className="flex h-36 items-end gap-2" role="img" aria-label="Carga média por jogador nas últimas 8 semanas">
          {weeks.map((w, i) => (
            <div key={w.start} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-muted">{w.avg ? Math.round(w.avg) : ""}</span>
              <div className={`w-full rounded-t ${i === weeks.length - 1 ? "bg-brand" : "bg-brand/40"}`} style={{ height: `${Math.max(2, (w.avg / maxWeek) * 96)}px` }} />
              <span className="truncate text-[10px] text-muted">{new Date(w.start + "T12:00").toLocaleDateString("pt-PT", { day: "numeric", month: "numeric" })}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">Média por jogador que respondeu. Subidas de mais de 30–50% de uma semana para a outra aumentam o risco de lesão e cansaço — sobe a carga aos poucos.</p>
      </section>
    </div>
  );
}

/** For players without a phone: the coach fills in the effort after a practice. */
function StaffEntry({ practices, loads, teamId, rows }: { practices: Practice[]; loads: PlayerLoad[]; teamId: string; rows: { id: string; rpe?: number }[] }) {
  const past = practices.filter((p) => p.date <= today()).slice(-8).reverse();
  const [pid, setPid] = useState(past[0]?.id ?? "");
  const p = past.find((x) => x.id === pid);
  if (!past.length) return <p className="px-3 py-3 text-sm text-muted">Ainda não há treinos registados.</p>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (
    <div className="grid gap-2 border-b border-line bg-bg/40 px-3 py-3">
      <select className="input w-full sm:w-auto" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Treino">
        {past.map((x) => <option key={x.id} value={x.id}>{shortDate(x.date)} · {x.title || "Treino"}</option>)}
      </select>
      {p && (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {loads.map((l) => {
            const cur = byId.get(sessionId(p.id, l.player.id))?.rpe;
            return (
              <label key={l.player.id} className="flex items-center gap-2 text-sm">
                <span className="w-28 truncate"><b className="font-mono">#{l.player.number}</b> {l.player.name.split(" ")[0]}</span>
                <select className="input flex-1 py-1" value={cur ?? ""} aria-label={`Esforço de ${l.player.name}`}
                  onChange={(e) => e.target.value && saveSession(teamId, l.player.id, { id: p.id, kind: "practice", date: p.date, title: p.title || "Treino", minutes: p.durationMin ?? DEFAULT_PRACTICE_MIN }, Number(e.target.value))}>
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v} · {RPE_LABEL[v]}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
