"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteGame } from "@/lib/db";
import { fmtPct, gameStats, possessions, reb, shotZones, type Line } from "@/lib/stats";
import { Court } from "@/components/Court";
import { BoxTable, sortRows } from "@/components/BoxScore";
import { ZONES } from "@/lib/court";
import { gameInsights, type Insight } from "@/lib/insights";
import { useSeason } from "@/lib/season";
import { useAccess } from "@/lib/auth";

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const data = useLiveQuery(async () => {
    const game = await db.games.get(id);
    if (!game) return { game: null };
    const [players, events] = await Promise.all([
      db.players.where("teamId").equals(game.teamId).toArray(),
      db.events.where("gameId").equals(id).toArray(),
    ]);
    return { game, players, events };
  }, [id]);
  const [shotFilter, setShotFilter] = useState<string>("us");
  const season = useSeason(data?.game?.teamId);
  const access = useAccess(data?.game?.teamId);

  const stats = useMemo(() => (data?.game ? gameStats(data.events!, data.game.periods, data.game.periodMinutes) : null), [data]);

  if (!data) return null;
  if (!data.game || !stats) return <p className="text-muted">Jogo não encontrado.</p>;
  const { game, players = [], events = [] } = data;
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = sortRows(players, stats.players);
  const seasonAvg = season ? new Map([...season.totals].map(([pid, l]) => [pid, { ...l, games: l.gp }])) : undefined;
  const insights = events.length ? gameInsights(game, stats, events, players, seasonAvg) : [];

  const shotEvents = events.filter((e) => e.type === "SHOT" && (shotFilter === "opp" ? e.side === "opp" : shotFilter === "us" ? e.side === "us" : e.playerId === shotFilter));
  const zones = shotZones(shotEvents);

  const lineups = [...stats.lineups.values()].filter((l) => l.pf + l.pa > 0).sort((a, b) => b.pf - b.pa - (a.pf - a.pa));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/jogos" className="text-sm text-muted hover:text-fg print:hidden">← Jogos</Link>
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
          <div className="flex gap-2 print:hidden">
            <button className="btn" onClick={() => window.print()}>Imprimir</button>
            {access.canEdit && <Link href={`/jogos/${id}/logger`} className="btn btn-primary">Abrir registo</Link>}
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="card p-10 text-center text-muted">
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
            <TeamCompare us={stats.us} opp={stats.opp} opponent={game.opponent} />
          </div>

          {insights.length > 0 && <Report insights={insights} gameId={id} />}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Box score</h2>
            <BoxTable rows={rows} total={stats.us} />
          </section>

          <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <div className="card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Mapa de lançamentos</h2>
                <select className="input w-full py-1 sm:w-auto" value={shotFilter} onChange={(e) => setShotFilter(e.target.value)}>
                  <option value="us">Equipa</option>
                  {rows.map(({ p }) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
                  <option value="opp">Adversário</option>
                </select>
              </div>
              <Court shots={shotEvents.filter((e) => e.x !== undefined).map((e) => ({ id: e.id, x: e.x!, y: e.y!, made: !!e.meta?.made, side: shotFilter === "opp" ? undefined : e.side }))} />
              <table className="tbl mt-2">
                <thead><tr><th>Zona</th><th>C/T</th><th>%</th></tr></thead>
                <tbody>
                  {ZONES.map((z) => {
                    const a = zones.find((x) => x.zone === z);
                    return <tr key={z}><td>{z}</td><td>{a ? `${a.m}/${a.a}` : "0/0"}</td><td>{a ? fmtPct(a.m, a.a) : "–"}</td></tr>;
                  })}
                </tbody>
              </table>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{shotEvents.filter((e) => e.x === undefined).length} lançamentos sem local marcado.</span>
                {shotEvents.length > 0 && (
                  <Link className="text-brand print:hidden" href={`/jogos/${id}/logger?${new URLSearchParams({ tipo: "SHOT", play: "1", ...(shotFilter === "us" || shotFilter === "opp" ? { lado: shotFilter } : { jogador: shotFilter }) })}`}>
                    ▶ Ver estes lançamentos
                  </Link>
                )}
              </div>
            </div>

            <div className="card h-fit overflow-x-auto">
              <div className="border-b border-line px-3 py-2">
                <h2 className="font-semibold">Quintetos</h2>
                <p className="text-xs text-muted">Pontos marcados e sofridos com cada 5 em campo.</p>
              </div>
              <table className="tbl">
                <thead><tr><th>Quinteto</th><th>Marc.</th><th>Sofr.</th><th>+/-</th></tr></thead>
                <tbody>
                  {lineups.map((l) => (
                    <tr key={l.ids.join()}>
                      <td className="whitespace-nowrap">{l.ids.map((pid) => byId.get(pid)).sort((a, b) => (a?.number ?? 0) - (b?.number ?? 0)).map((p) => `#${p?.number}`).join(" · ")}</td>
                      <td>{l.pf}</td><td>{l.pa}</td>
                      <td className={l.pf - l.pa > 0 ? "text-good" : l.pf - l.pa < 0 ? "text-bad" : ""}>{l.pf - l.pa > 0 ? "+" : ""}{l.pf - l.pa}</td>
                    </tr>
                  ))}
                  {lineups.length === 0 && <tr><td colSpan={4} className="py-6 text-center! text-muted">Regista o 5 inicial e as substituições para ver quintetos.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {access.canEdit && <GameInfo gameId={id} onDelete={async () => { if (confirm("Apagar este jogo e todos os eventos?")) { await deleteGame(id); router.push("/jogos"); } }} />}
    </div>
  );
}

function TeamCompare({ us, opp, opponent }: { us: Line; opp: Line; opponent: string }) {
  const rows: [string, string, string, number, number][] = [
    ["Lançamentos campo", `${us.fgm}/${us.fga} (${fmtPct(us.fgm, us.fga)})`, `${opp.fgm}/${opp.fga} (${fmtPct(opp.fgm, opp.fga)})`, us.fgm / (us.fga || 1), opp.fgm / (opp.fga || 1)],
    ["Triplos", `${us.p3m}/${us.p3a} (${fmtPct(us.p3m, us.p3a)})`, `${opp.p3m}/${opp.p3a} (${fmtPct(opp.p3m, opp.p3a)})`, us.p3m / (us.p3a || 1), opp.p3m / (opp.p3a || 1)],
    ["Lances livres", `${us.ftm}/${us.fta} (${fmtPct(us.ftm, us.fta)})`, `${opp.ftm}/${opp.fta} (${fmtPct(opp.ftm, opp.fta)})`, us.ftm / (us.fta || 1), opp.ftm / (opp.fta || 1)],
    ["Ressaltos (of.)", `${reb(us)} (${us.oreb})`, `${reb(opp)} (${opp.oreb})`, reb(us), reb(opp)],
    ["Perdas de bola", String(us.tov), String(opp.tov), -us.tov, -opp.tov],
    ["Faltas", String(us.pf), String(opp.pf), -us.pf, -opp.pf],
    ["Posses (est.)", possessions(us).toFixed(0), possessions(opp).toFixed(0), 0, 0],
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
      <button className="text-sm font-semibold" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} Dados do jogo e notas</button>
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
          <div className="sm:col-span-4"><button className="btn btn-danger" onClick={onDelete}>Apagar jogo</button></div>
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
              <Link href={`/jogos/${gameId}/logger?${it.clips}`} className="mt-1 inline-block text-xs text-brand print:hidden">▶ Ver jogadas</Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
