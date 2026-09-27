"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteId } from "@/lib/route";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { DeleteGameButton } from "@/components/DeleteGame";
import { fmtPct, fmtTs, gameStats, possessions, reb, type Line } from "@/lib/stats";
import { BoxTable, sortRows } from "@/components/BoxScore";
import { ShotQuality } from "@/components/ShotQuality";
import { zoneModel } from "@/lib/shotQuality";
import { gameInsights, type Insight } from "@/lib/insights";
import { useSeason } from "@/lib/season";
import { useAccess } from "@/lib/auth";
import { ContextTable } from "@/components/ContextTable";
import { ShareDialog } from "@/components/ShareDialog";
import { LineupAnalysis } from "@/components/LineupAnalysis";
import { PossessionTable } from "@/components/PossessionTable";
import { ReviewList } from "@/components/ReviewList";
import { GamePlan } from "@/components/GamePlan";
import { RotationPlanner } from "@/components/RotationPlanner";
import { PlayerReports } from "@/components/PlayerReport";
import { GameTimeline } from "@/components/GameTimeline";
import { possessions as countPossessions } from "@/lib/possessions";
import { reviewItems } from "@/lib/review";

export function GamePage() {
  const id = useRouteId();
  const router = useRouter();
  const data = useLiveQuery(async () => {
    const game = await db.games.get(id);
    if (!game) return { game: null };
    const [players, events, team] = await Promise.all([
      db.players.where("teamId").equals(game.teamId).toArray(),
      db.events.where("gameId").equals(id).toArray(),
      db.teams.get(game.teamId),
    ]);
    return { game, players, events, team };
  }, [id]);
  const [shotFilter, setShotFilter] = useState<string>("us");
  const season = useSeason(data?.game?.teamId);
  const access = useAccess(data?.game?.teamId);

  const stats = useMemo(() => (data?.game ? gameStats(data.events!, data.game.periods, data.game.periodMinutes) : null), [data]);
  const [sharing, setSharing] = useState(false);
  const model = useMemo(() => zoneModel([...(season?.games.flatMap((g) => (g.game.id === id ? [] : g.events)) ?? []), ...(data?.events ?? [])]), [season, data, id]);
  const notes = useLiveQuery(() => db.notes.where("gameId").equals(id).sortBy("videoTs"), [id]);
  const review = useMemo(() => (data?.game && data.events?.length ? reviewItems(countPossessions(data.events), data.events, data.players ?? [], data.game.periods) : []), [data]);
  const shareData = useMemo(() => {
    if (!data?.game || !data.team || !stats || !data.events?.length) return null;
    const avg = season ? new Map([...season.totals].map(([pid, l]) => [pid, { ...l, games: l.gp }])) : undefined;
    return { team: data.team, game: data.game, stats, players: data.players ?? [], insights: gameInsights(data.game, stats, data.events, data.players ?? [], avg) };
  }, [data, stats, season]);

  if (!data) return null;
  if (!data.game || !stats) return <p className="text-muted">Jogo não encontrado.</p>;
  const { game, players = [], events = [] } = data;
  const rows = sortRows(players, stats.players);
  const seasonAvg = season ? new Map([...season.totals].map(([pid, l]) => [pid, { ...l, games: l.gp }])) : undefined;
  const insights = events.length ? gameInsights(game, stats, events, players, seasonAvg) : [];

  const shotEvents = events.filter((e) => e.type === "SHOT" && (shotFilter === "opp" ? e.side === "opp" : shotFilter === "us" ? e.side === "us" : e.playerId === shotFilter));


  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/jogos" className="tap text-sm text-muted hover:text-fg print:hidden">← Jogos</Link>
          <h1 className="mt-1 text-2xl font-semibold">{game.home ? "vs" : "@"} {game.opponent}</h1>
          <p className="text-sm text-muted">
            {new Date(game.date + "T12:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {game.competition ? ` · ${game.competition}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="text-center">
            <div className="text-xs text-muted">NÓS</div>
            <div className="font-mono text-4xl font-bold">{stats.us.pts}</div>
          </div>
          <div className="text-muted">—</div>
          <div className="text-center">
            <div className="text-xs text-muted">{game.opponent.toUpperCase()}</div>
            <div className="font-mono text-4xl font-bold text-opp">{stats.opp.pts}</div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 whitespace-nowrap sm:flex sm:w-auto print:hidden">
            {shareData && <button className="btn btn-primary" onClick={() => setSharing(true)}>Partilhar</button>}
            <button className="btn" onClick={() => window.print()}>Imprimir</button>
            {access.canEdit && <Link href={`/jogos/${id}/ao-vivo`} className={`btn ${game.video.kind === "none" ? "btn-primary" : ""}`}>Ao vivo</Link>}
            {access.canEdit && <Link href={`/jogos/${id}/logger`} className={`btn ${game.video.kind === "none" ? "" : "btn-primary"}`}>{game.video.kind === "none" ? "Registo" : "Abrir registo"}</Link>}
            {access.canEdit && <DeleteGameButton game={game} className={shareData ? "col-span-2 sm:col-span-1" : ""} onDeleted={() => router.push("/jogos")} />}
          </div>
        </div>
      </div>

      {events.length === 0 && <GamePlan game={game} events={events} canEdit={access.canEdit} />}
      {events.length === 0 && <RotationPlanner game={game} events={events} canEdit={access.canEdit} />}

      {events.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <Link href={`/adversarios?nome=${encodeURIComponent(game.opponent)}`} className="btn mb-4">Scouting de {game.opponent}</Link>
          <br />
          Ainda sem eventos. <Link href={`/jogos/${id}/logger`} className="text-brand">Abre o registo</Link> e começa pelo 5 inicial.
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="card overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr><th>Parcial</th>{stats.byPeriod.map((_, i) => <th key={i}>{i < 4 ? `${i + 1}º` : `P${i - 3}`}</th>)}<th>T</th></tr>
                </thead>
                <tbody>
                  <tr><td>Nós</td>{stats.byPeriod.map((p, i) => <td key={i}>{p.us}</td>)}<td className="font-bold">{stats.us.pts}</td></tr>
                  <tr><td className="text-opp">{game.opponent}</td>{stats.byPeriod.map((p, i) => <td key={i}>{p.opp}</td>)}<td className="font-bold">{stats.opp.pts}</td></tr>
                </tbody>
              </table>
            </div>
            <TeamCompare us={stats.us} opp={stats.opp} opponent={game.opponent} poss={(() => { const ps = countPossessions(events); return { us: ps.filter((p) => p.side === "us").length, opp: ps.filter((p) => p.side === "opp").length }; })()} />
          </div>

          {access.canEdit && <ReviewList game={game} events={events} players={players} />}

          <GameTimeline game={game} events={events} players={players} notes={access.canEdit ? notes ?? [] : []} review={access.canEdit ? review : []} />

          {access.canEdit && notes && notes.length > 0 && (
            <section className="card overflow-hidden">
              <div className="border-b border-line px-3 py-2">
                <h2 className="font-semibold">Notas de vídeo</h2>
                <p className="text-xs text-muted">Só a equipa técnica vê. Adiciona-as no registo com o botão 📝 (tecla N).</p>
              </div>
              <ul className="divide-y divide-line/60">
                {notes.map((n) => (
                  <li key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Link href={`/jogos/${id}/logger?${new URLSearchParams({ janela: `${Math.max(0, Math.floor(n.videoTs - 6))}-${Math.ceil(n.videoTs + 6)}`, play: "1" })}`}
                      className="tap shrink-0 font-mono text-xs text-brand">▶ {fmtTs(n.videoTs)}</Link>
                    <span className="w-6 shrink-0 font-mono text-xs text-muted">P{n.period}</span>
                    <span className="min-w-0 flex-1">{n.text}</span>
                    {n.author && <span className="hidden shrink-0 text-xs text-muted sm:inline">{n.author}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <GamePlan game={game} events={events} canEdit={access.canEdit} />
          <RotationPlanner game={game} events={events} canEdit={access.canEdit} />
          {access.canEdit && <PlayerReports game={game} events={events} players={players} />}

          {insights.length > 0 && <Report insights={insights} gameId={id} />}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Box score</h2>
            <BoxTable rows={rows} total={stats.us} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <PossessionTable games={[{ events }]} opponent={game.opponent} />
            <ContextTable events={events} gameId={id} opponent={game.opponent} />
          </div>

          <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <div className="card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Lançamentos e qualidade</h2>
                <select className="input w-full py-1 sm:w-auto" value={shotFilter} onChange={(e) => setShotFilter(e.target.value)} aria-label="De quem">
                  <option value="us">Equipa</option>
                  {rows.map(({ p }) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
                  <option value="opp">Adversário</option>
                </select>
              </div>
              <ShotQuality shots={shotEvents} model={model} opp={shotFilter === "opp"}
                clipsHref={`/jogos/${id}/logger?${new URLSearchParams({ tipo: "SHOT", play: "1", ...(shotFilter === "us" || shotFilter === "opp" ? { lado: shotFilter } : { jogador: shotFilter }) })}`} />
            </div>

            <LineupAnalysis games={[{ game, events }]} players={players} />
          </section>
        </>
      )}

      {sharing && shareData && <ShareDialog data={shareData} onClose={() => setSharing(false)} />}

      {access.canEdit && <GameInfo gameId={id} onDelete={() => router.push("/jogos")} />}
    </div>
  );
}

function TeamCompare({ us, opp, opponent, poss }: { us: Line; opp: Line; opponent: string; poss: { us: number; opp: number } }) {
  const rows: [string, string, string, number, number][] = [
    ["Lançamentos campo", `${us.fgm}/${us.fga} (${fmtPct(us.fgm, us.fga)})`, `${opp.fgm}/${opp.fga} (${fmtPct(opp.fgm, opp.fga)})`, us.fgm / (us.fga || 1), opp.fgm / (opp.fga || 1)],
    ["Triplos", `${us.p3m}/${us.p3a} (${fmtPct(us.p3m, us.p3a)})`, `${opp.p3m}/${opp.p3a} (${fmtPct(opp.p3m, opp.p3a)})`, us.p3m / (us.p3a || 1), opp.p3m / (opp.p3a || 1)],
    ["Lances livres", `${us.ftm}/${us.fta} (${fmtPct(us.ftm, us.fta)})`, `${opp.ftm}/${opp.fta} (${fmtPct(opp.ftm, opp.fta)})`, us.ftm / (us.fta || 1), opp.ftm / (opp.fta || 1)],
    ["Ressaltos (of.)", `${reb(us)} (${us.oreb})`, `${reb(opp)} (${opp.oreb})`, reb(us), reb(opp)],
    ["Perdas de bola", String(us.tov), String(opp.tov), -us.tov, -opp.tov],
    ["Faltas", String(us.pf), String(opp.pf), -us.pf, -opp.pf],
    ["Posses", String(poss.us || Math.round(possessions(us))), String(poss.opp || Math.round(possessions(opp))), 0, 0],
  ];
  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <thead><tr><th></th><th>Nós</th><th className="text-opp!">{opponent}</th></tr></thead>
        <tbody>
          {rows.map(([k, a, b, va, vb]) => (
            <tr key={k}>
              <td className="text-muted">{k}</td>
              <td className={va > vb ? "font-semibold text-good" : ""}>{a}</td>
              <td className={vb > va ? "font-semibold text-opp" : ""}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameInfo({ gameId, onDelete }: { gameId: string; onDelete: () => void }) {
  const game = useLiveQuery(() => db.games.get(gameId), [gameId]);
  const [open, setOpen] = useState(false);
  if (!game) return null;
  const upd = (patch: Parameters<typeof db.games.update>[1]) => db.games.update(gameId, patch);
  return (
    <section className="card p-4">
      <button className="tap w-full text-left text-sm font-semibold" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} Dados do jogo e notas</button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div><label className="label">Adversário</label><input className="input" value={game.opponent} onChange={(e) => upd({ opponent: e.target.value })} /></div>
          <div><label className="label">Data</label><input type="date" className="input" value={game.date} onChange={(e) => upd({ date: e.target.value })} /></div>
          <div><label className="label">Competição</label><input className="input" value={game.competition ?? ""} onChange={(e) => upd({ competition: e.target.value })} /></div>
          <div>
            <label className="label">Vídeo YouTube</label>
            <input className="input" placeholder="https://youtube.com/…" value={game.video.kind === "youtube" ? game.video.url : ""}
              onChange={(e) => upd({ video: e.target.value ? { kind: "youtube", url: e.target.value } : { kind: "file" } })} />
          </div>
          <div className="sm:col-span-4"><label className="label">Notas do treinador</label>
            <textarea className="input" rows={3} value={game.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })} /></div>
          <div className="sm:col-span-4"><DeleteGameButton game={game} onDeleted={onDelete} /></div>
        </div>
      )}
    </section>
  );
}

const TONE: Record<Insight["tone"], string> = {
  good: "border-l-good",
  bad: "border-l-bad",
  info: "border-l-opp",
};

function Report({ insights, gameId }: { insights: Insight[]; gameId: string }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Relatório do jogo</h2>
      <p className="mb-3 text-xs text-muted">Gerado automaticamente a partir dos eventos. Os links abrem a sequência das jogadas no vídeo.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((it, i) => (
          <div key={i} className={`card border-l-4 px-3 py-2.5 ${TONE[it.tone]}`}>
            <div className="text-sm font-semibold">{it.title}</div>
            <p className="mt-0.5 text-xs text-muted">{it.text}</p>
            {it.clips && (
              <Link href={`/jogos/${gameId}/logger?${it.clips}`} className="tap mt-1 inline-block text-xs text-brand print:hidden">▶ Ver jogadas</Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
