"use client";

import Link from "next/link";
import { useRouteId } from "@/lib/route";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSeason } from "@/lib/season";
import { eff, fmtMin, fmtPct, reb } from "@/lib/stats";
import { ShotQuality } from "@/components/ShotQuality";
import { zoneModel } from "@/lib/shotQuality";
import { Trend } from "@/components/Trend";
import { Kpi } from "@/components/Kpi";
import { GoalCard } from "@/components/Goals";
import { FeedbackComposer, FeedbackList } from "@/components/Feedback";
import { useAccess } from "@/lib/auth";
import { PhysicalProfile } from "@/components/Physical";
import { useState } from "react";

export function PlayerPage() {
  const id = useRouteId();
  const player = useLiveQuery(() => db.players.get(id), [id]);
  const s = useSeason(player?.teamId);
  const goals = useLiveQuery(() => db.goals.where("playerId").equals(id).filter((g) => g.active).toArray(), [id]);
  const access = useAccess(player?.teamId);
  const [composing, setComposing] = useState(false);
  if (!player || !s) return null;

  const t = s.totals.get(id);
  const gp = t?.gp ?? 0;
  const pg = (v: number) => (gp ? (v / gp).toFixed(1) : "–");
  const log = s.games.map(({ game, stats }) => ({ game, l: stats.players.get(id) })).filter((r) => r.l?.gp);
  const shots = s.games.flatMap((g) => g.events).filter((e) => e.type === "SHOT" && e.playerId === id);
  const att = s.attendancePct.get(id);

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/equipa" className="tap text-sm text-muted hover:text-fg">← Plantel</Link>
        <div className="mt-2 flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand font-mono text-2xl font-bold text-black">{player.number}</span>
          <div>
            <h1 className="text-2xl font-semibold">{player.name}</h1>
            <p className="text-sm text-muted">
              {[player.position, player.heightCm && `${player.heightCm} cm`, player.birthYear && `n. ${player.birthYear}`].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Jogos" value={String(gp)} sub={t?.min ? `${pg(t.min)} min/jogo` : undefined} />
        <Kpi label="PTS" value={pg(t?.pts ?? 0)} />
        <Kpi label="RT" value={pg(t ? reb(t) : 0)} />
        <Kpi label="AST" value={pg(t?.ast ?? 0)} />
        <Kpi label="ROU" value={pg(t?.stl ?? 0)} />
        <Kpi label="PB" value={pg(t?.tov ?? 0)} />
        <Kpi label="LC %" value={t ? fmtPct(t.fgm, t.fga) : "–"} sub={t ? `3P ${fmtPct(t.p3m, t.p3a)} · LL ${fmtPct(t.ftm, t.fta)}` : undefined} />
        <Kpi label="Assiduidade" value={att === null || att === undefined ? "–" : `${att}%`} />
      </div>

      {goals && goals.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Objetivos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((g) => <GoalCard key={g.id} goal={g} season={s} players={new Map([[player.id, player]])} />)}
          </div>
        </section>
      )}

      {(access.canEdit || access.playerId === player.id) && <PhysicalProfile player={player} isStaff={access.canEdit} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Evolução por jogo</h2>
          <Trend
            labels={log.map((r) => r.game.opponent.slice(0, 8))}
            series={[
              { label: "Pontos", color: "#ff7a1a", values: log.map((r) => r.l!.pts) },
              { label: "Ressaltos", color: "#34d399", values: log.map((r) => reb(r.l!)) },
              { label: "Assistências", color: "#60a5fa", values: log.map((r) => r.l!.ast) },
              { label: "Eficiência", color: "#c084fc", values: log.map((r) => eff(r.l!)) },
            ]}
          />
        </div>
        <div className="card p-3">
          <h2 className="mb-2 font-semibold">Lançamentos na época</h2>
          <ShotQuality shots={shots} model={zoneModel(s.games.flatMap((g) => g.events))} />
        </div>
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-line px-3 py-2"><h2 className="font-semibold">Jogo a jogo</h2></div>
        <table className="tbl">
          <thead><tr><th>Jogo</th><th>MIN</th><th>PTS</th><th>LC</th><th>3P</th><th>LL</th><th>RT</th><th>AST</th><th>ROU</th><th>PB</th><th>F</th><th>+/-</th><th>EF</th></tr></thead>
          <tbody>
            {log.map(({ game, l }) => (
              <tr key={game.id}>
                <td><Link className="hover:text-brand" href={`/jogos/${game.id}`}>{game.home ? "vs" : "@"} {game.opponent} <span className="text-muted">· {game.date}</span></Link></td>
                <td className="text-muted">{fmtMin(l!.min)}</td>
                <td className="font-semibold">{l!.pts}</td><td>{l!.fgm}/{l!.fga}</td><td>{l!.p3m}/{l!.p3a}</td><td>{l!.ftm}/{l!.fta}</td>
                <td>{reb(l!)}</td><td>{l!.ast}</td><td>{l!.stl}</td><td>{l!.tov}</td><td>{l!.pf}</td>
                <td className={l!.pm > 0 ? "text-good" : l!.pm < 0 ? "text-bad" : ""}>{l!.pm > 0 ? "+" : ""}{l!.pm}</td><td>{eff(l!)}</td>
              </tr>
            ))}
            {log.length === 0 && <tr><td colSpan={13} className="py-6 text-center! text-muted">Ainda sem jogos registados.</td></tr>}
          </tbody>
        </table>
      </section>

      {access.canEdit && (
        <div className="-mb-3 flex justify-end">
          <button className="btn" onClick={() => setComposing(true)}>✉ Enviar mensagem a {player.name.split(" ")[0]}</button>
        </div>
      )}
      <FeedbackList player={player} isMe={access.isPlayer && access.playerId === player.id} canEdit={access.canEdit} />
      {composing && <FeedbackComposer teamId={player.teamId} players={[player]} initial={{ playerId: player.id }} onClose={() => setComposing(false)} />}

      {player.notes && access.canEdit && <section className="card p-4 text-sm"><h2 className="mb-1 font-semibold">Notas</h2><p className="whitespace-pre-wrap text-muted">{player.notes}</p></section>}
    </div>
  );
}
