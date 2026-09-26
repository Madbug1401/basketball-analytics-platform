"use client";

import Link from "next/link";
import { useState } from "react";
import { useTeam } from "@/lib/team";
import { useSeason, type SeasonData } from "@/lib/season";
import { addLines, emptyLine, fmtPct, possessions, reb, shotZones } from "@/lib/stats";
import { ZONES } from "@/lib/court";
import { Court } from "@/components/Court";
import { Kpi } from "@/components/Kpi";

export default function OpponentsPage() {
  const { team } = useTeam();
  const s = useSeason(team?.id);
  const [sel, setSel] = useState<string | null>(null);
  if (!team || !s) return null;

  const byOpp = new Map<string, typeof s.games>();
  s.games.forEach((g) => {
    const k = g.game.opponent.trim();
    byOpp.set(k, [...(byOpp.get(k) ?? []), g]);
  });
  const opponents = [...byOpp.entries()].map(([name, games]) => {
    const w = games.filter((g) => g.stats.us.pts > g.stats.opp.pts).length;
    const pf = games.reduce((a, g) => a + g.stats.us.pts, 0) / games.length;
    const pa = games.reduce((a, g) => a + g.stats.opp.pts, 0) / games.length;
    return { name, games, w, l: games.length - w, pf, pa };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const current = opponents.find((o) => o.name === sel) ?? opponents[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Adversários</h1>
        <div className="card divide-y divide-line">
          {opponents.map((o) => (
            <button key={o.name} onClick={() => setSel(o.name)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-panel-2 ${current?.name === o.name ? "bg-panel-2" : ""}`}>
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-muted">{o.games.length} jogo{o.games.length > 1 ? "s" : ""} · {o.pf.toFixed(0)}–{o.pa.toFixed(0)} em média</div>
              </div>
              <span className={`font-mono text-sm ${o.w > o.l ? "text-good" : o.w < o.l ? "text-bad" : "text-muted"}`}>{o.w}–{o.l}</span>
            </button>
          ))}
          {opponents.length === 0 && <p className="p-6 text-center text-sm text-muted">Ainda sem jogos registados.</p>}
        </div>
      </section>

      {current && <OpponentDetail o={current} />}
    </div>
  );
}

function OpponentDetail({ o }: { o: { name: string; games: SeasonData["games"]; w: number; l: number; pf: number; pa: number } }) {
  const their = o.games.reduce((acc, g) => addLines(acc, { ...g.stats.opp }), emptyLine());
  const ours = o.games.reduce((acc, g) => addLines(acc, { ...g.stats.us }), emptyLine());
  const n = o.games.length;
  const avg = (v: number) => (v / n).toFixed(1);
  const shots = o.games.flatMap((g) => g.events).filter((e) => e.side === "opp" && e.type === "SHOT");
  const zones = shotZones(shots);
  const byPeriod = [0, 1, 2, 3].map((i) => ({
    us: o.games.reduce((a, g) => a + (g.stats.byPeriod[i]?.us ?? 0), 0) / n,
    opp: o.games.reduce((a, g) => a + (g.stats.byPeriod[i]?.opp ?? 0), 0) / n,
  }));
  const threeShare = their.fga ? Math.round((their.p3a / their.fga) * 100) : 0;

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">{o.name}</h2>
        <p className="text-sm text-muted">Tudo o que sabemos deles a partir dos nossos jogos.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Nosso registo" value={`${o.w}–${o.l}`} />
        <Kpi label="Pontos deles / jogo" value={avg(their.pts)} sub={`nós ${avg(ours.pts)}`} />
        <Kpi label="LC % deles" value={fmtPct(their.fgm, their.fga)} sub={`3P ${fmtPct(their.p3m, their.p3a)}`} />
        <Kpi label="Ressaltos of. deles" value={avg(their.oreb)} sub={`total ${avg(reb(their))}`} />
        <Kpi label="Perdas deles / jogo" value={avg(their.tov)} sub={`posses ${avg(possessions(their))}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="card p-3">
          <h3 className="mb-2 font-semibold">Onde lançam</h3>
          <Court shots={shots.filter((e) => e.x !== undefined).map((e) => ({ id: e.id, x: e.x!, y: e.y!, made: !!e.meta?.made }))} />
          <table className="tbl mt-2">
            <thead><tr><th>Zona</th><th>% lanç.</th><th>C/T</th><th>%</th></tr></thead>
            <tbody>
              {ZONES.map((z) => {
                const a = zones.find((x) => x.zone === z);
                const share = a && shots.length ? Math.round((a.a / shots.filter((e) => e.x !== undefined).length) * 100) : 0;
                return <tr key={z}><td>{z}</td><td className="text-muted">{share}%</td><td>{a ? `${a.m}/${a.a}` : "0/0"}</td><td>{a ? fmtPct(a.m, a.a) : "–"}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="grid h-fit gap-4">
          <div className="card overflow-x-auto">
            <div className="border-b border-line px-3 py-2"><h3 className="font-semibold">Média por período</h3></div>
            <table className="tbl">
              <thead><tr><th></th><th>1º</th><th>2º</th><th>3º</th><th>4º</th></tr></thead>
              <tbody>
                <tr><td>Nós</td>{byPeriod.map((p, i) => <td key={i}>{p.us.toFixed(1)}</td>)}</tr>
                <tr><td className="text-opp">{o.name}</td>{byPeriod.map((p, i) => <td key={i} className={p.opp > p.us ? "text-bad" : ""}>{p.opp.toFixed(1)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold">Notas rápidas</h3>
            <ul className="grid gap-1 text-muted">
              <li>• {threeShare}% dos lançamentos deles são triplos ({fmtPct(their.p3m, their.p3a)}).</li>
              <li>• Lances livres: {fmtPct(their.ftm, their.fta)} em {avg(their.fta)} tentativas por jogo.</li>
              <li>• Nós perdemos {avg(ours.tov)} bolas por jogo contra eles; eles {avg(their.tov)}.</li>
              <li>• Ressaltos: {avg(reb(ours))} nós vs {avg(reb(their))} eles.</li>
            </ul>
          </div>
          <div className="card divide-y divide-line">
            {o.games.map((g) => (
              <Link key={g.game.id} href={`/jogos/${g.game.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-panel-2">
                <span>{g.game.home ? "vs" : "@"} {o.name} <span className="text-muted">· {g.game.date}</span></span>
                <span className={`font-mono ${g.stats.us.pts > g.stats.opp.pts ? "text-good" : "text-bad"}`}>{g.stats.us.pts}–{g.stats.opp.pts}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Os eventos do adversário são registados a nível de equipa (sem jogadores individuais).</p>
    </section>
  );
}
