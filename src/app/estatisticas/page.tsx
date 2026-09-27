"use client";

import { useMemo, useState } from "react";
import { useTeam } from "@/lib/team";
import { useSeason, type SeasonData } from "@/lib/season";
import { BoxTable, sortRows } from "@/components/BoxScore";
import { Trend } from "@/components/Trend";
import { Kpi } from "@/components/Kpi";
import { ContextTable } from "@/components/ContextTable";
import { LineupAnalysis } from "@/components/LineupAnalysis";
import { PossessionTable } from "@/components/PossessionTable";
import { fmtPct, possessions, reb } from "@/lib/stats";
import { ShooterTable, ShotQuality } from "@/components/ShotQuality";
import { zoneModel } from "@/lib/shotQuality";

export default function SeasonStats() {
  const { team } = useTeam();
  const s = useSeason(team?.id);
  const [mode, setMode] = useState<"avg" | "tot">("avg");
  if (!team || !s) return null;

  const gp = s.games.length;
  const avg = (v: number) => (gp ? (v / gp).toFixed(1) : "–");
  const rows = sortRows(s.players, s.totals);

  // simple, honest splits: wins vs losses
  const wins = s.games.filter((g) => g.stats.us.pts > g.stats.opp.pts);
  const losses = s.games.filter((g) => g.stats.us.pts < g.stats.opp.pts);
  const split = (list: SeasonData["games"], f: (g: SeasonData["games"][number]) => number) =>
    list.length ? (list.reduce((a, g) => a + f(g), 0) / list.length).toFixed(1) : "–";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Estatísticas da época</h1>
          <p className="text-sm text-muted">{team.name} {team.category} · {team.season} · {gp} jogos registados</p>
        </div>
        <div className="flex gap-1">
          <button className={`btn ${mode === "avg" ? "btn-primary" : ""}`} onClick={() => setMode("avg")}>Médias</button>
          <button className={`btn ${mode === "tot" ? "btn-primary" : ""}`} onClick={() => setMode("tot")}>Totais</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Registo" value={`${s.record.w}–${s.record.l}`} />
        <Kpi label="Pontos / jogo" value={avg(s.team.pts)} sub={`sofridos ${avg(s.opp.pts)}`} />
        <Kpi label="LC %" value={fmtPct(s.team.fgm, s.team.fga)} sub={`adv. ${fmtPct(s.opp.fgm, s.opp.fga)}`} />
        <Kpi label="3P %" value={fmtPct(s.team.p3m, s.team.p3a)} sub={`${avg(s.team.p3a)} tent./jogo`} />
        <Kpi label="LL %" value={fmtPct(s.team.ftm, s.team.fta)} sub={`${avg(s.team.fta)} tent./jogo`} />
        <Kpi label="Ressaltos / jogo" value={avg(reb(s.team))} sub={`adv. ${avg(reb(s.opp))}`} />
        <Kpi label="Perdas / jogo" value={avg(s.team.tov)} sub={`adv. ${avg(s.opp.tov)}`} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Pontos por jogo</h2>
          <Trend
            labels={s.games.map((g, i) => `J${i + 1}`)}
            series={[
              { label: "Marcados", color: "#ff7a1a", values: s.games.map((g) => g.stats.us.pts) },
              { label: "Sofridos", color: "#60a5fa", values: s.games.map((g) => g.stats.opp.pts) },
            ]}
          />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Vitórias vs derrotas</h2>
          <table className="tbl">
            <thead><tr><th>Média por jogo</th><th>Vitórias ({wins.length})</th><th>Derrotas ({losses.length})</th></tr></thead>
            <tbody>
              <tr><td>Pontos marcados</td><td>{split(wins, (g) => g.stats.us.pts)}</td><td>{split(losses, (g) => g.stats.us.pts)}</td></tr>
              <tr><td>Pontos sofridos</td><td>{split(wins, (g) => g.stats.opp.pts)}</td><td>{split(losses, (g) => g.stats.opp.pts)}</td></tr>
              <tr><td>Perdas de bola</td><td>{split(wins, (g) => g.stats.us.tov)}</td><td>{split(losses, (g) => g.stats.us.tov)}</td></tr>
              <tr><td>Ressaltos (dif.)</td><td>{split(wins, (g) => reb(g.stats.us) - reb(g.stats.opp))}</td><td>{split(losses, (g) => reb(g.stats.us) - reb(g.stats.opp))}</td></tr>
              <tr><td>Ressaltos ofensivos</td><td>{split(wins, (g) => g.stats.us.oreb)}</td><td>{split(losses, (g) => g.stats.us.oreb)}</td></tr>
              <tr><td>Lances livres tentados</td><td>{split(wins, (g) => g.stats.us.fta)}</td><td>{split(losses, (g) => g.stats.us.fta)}</td></tr>
              <tr><td>Posses (est.)</td><td>{split(wins, (g) => possessions(g.stats.us))}</td><td>{split(losses, (g) => possessions(g.stats.us))}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Com poucos jogos, as diferenças podem ser acaso — olha para tendências ao longo da época.</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Jogadores</h2>
        <BoxTable rows={rows} total={s.team} perGame={mode === "avg"} />
      </section>

      <LineupAnalysis season players={s.players}
        games={s.games.map((g) => ({ game: g.game, events: g.events, min: new Map([...g.stats.players].map(([id, l]) => [id, l.min])) }))} />

      <SeasonShots s={s} />

      <div className="grid gap-4 lg:grid-cols-2">
        <PossessionTable games={s.games} opponent="Adversários" />
        <ContextTable events={s.games.flatMap((g) => g.events)} opponent="Adversários" />
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-line px-3 py-2"><h2 className="font-semibold">Assiduidade × produção</h2></div>
        <table className="tbl">
          <thead><tr><th>Jogador</th><th>Assiduidade</th><th>Jogos</th><th>PTS/J</th><th>+/- total</th></tr></thead>
          <tbody>
            {s.players.filter((p) => p.active).map((p) => {
              const l = s.totals.get(p.id);
              const a = s.attendancePct.get(p.id);
              return (
                <tr key={p.id}>
                  <td>#{p.number} {p.name}</td>
                  <td>{a === null || a === undefined ? "–" : `${a}%`}</td>
                  <td>{l?.gp ?? 0}</td>
                  <td>{l?.gp ? (l.pts / l.gp).toFixed(1) : "–"}</td>
                  <td className={l && l.pm > 0 ? "text-good" : l && l.pm < 0 ? "text-bad" : ""}>{l ? (l.pm > 0 ? "+" : "") + l.pm : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SeasonShots({ s }: { s: SeasonData }) {
  const [side, setSide] = useState<"us" | "opp">("us");
  const all = useMemo(() => s.games.flatMap((g) => g.events), [s]);
  const model = useMemo(() => zoneModel(all), [all]);
  return (
    <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Qualidade de lançamento</h2>
          <select className="input w-auto py-1" value={side} onChange={(e) => setSide(e.target.value as "us" | "opp")} aria-label="Equipa">
            <option value="us">Nós</option>
            <option value="opp">Adversários</option>
          </select>
        </div>
        <ShotQuality shots={all.filter((e) => e.type === "SHOT" && e.side === side)} model={model} opp={side === "opp"} />
      </div>
      <div className="card h-fit p-3">
        <h2 className="mb-2 font-semibold">Quem lança bem</h2>
        <ShooterTable events={all} model={model} players={s.players} />
      </div>
    </section>
  );
}
