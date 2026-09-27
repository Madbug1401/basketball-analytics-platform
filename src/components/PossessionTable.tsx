"use client";

import { useMemo } from "react";
import { possessions, profile, type SideProfile } from "@/lib/possessions";
import type { GameEvent } from "@/lib/types";

const f = (v: number | null, d = 0, suf = "") => (v === null ? "–" : `${v.toFixed(d)}${suf}`);

/** Possession-based profile of both teams (one game or a whole season). */
export function PossessionTable({ games, opponent = "Adversário" }: { games: { events: GameEvent[] }[]; opponent?: string }) {
  const data = useMemo(() => {
    const events = games.flatMap((g) => g.events);
    const poss = games.flatMap((g) => possessions(g.events));
    return { us: profile(events, poss, "us"), opp: profile(events, poss, "opp"), n: games.filter((g) => g.events.length).length };
  }, [games]);
  if (!data.us.poss && !data.opp.poss) return null;
  const per = data.n > 1 ? data.n : 1;

  const rows: [string, (p: SideProfile) => string, string, "high" | "low" | null][] = [
    ["Posses" + (per > 1 ? " / jogo" : ""), (p) => f(p.poss / per, per > 1 ? 1 : 0), "Número de ataques (o ritmo do jogo)", null],
    ["Pontos por posse", (p) => f(p.ppp, 2), "A medida mais completa de eficiência", "high"],
    ["eFG%", (p) => f(p.efg, 0, "%"), "Lançamentos de campo com o triplo a valer 1,5", "high"],
    ["% perdas", (p) => f(p.tovPct, 0, "%"), "Posses que acabam em perda de bola", "low"],
    ["% ressalto ofensivo", (p) => f(p.orebPct, 0, "%"), "Dos ressaltos ofensivos disponíveis", "high"],
    ["LL por lançamento", (p) => f(p.ftRate, 2), "Tentativas de lance livre por lançamento de campo", "high"],
    ["Transição", (p) => (p.transition.poss ? `${f(p.transition.ppp, 2)} · ${p.transition.poss}` : "–"), "Pontos por posse · posses (jogadas marcadas como transição)", "high"],
    ["Ataque organizado", (p) => (p.halfCourt.poss ? `${f(p.halfCourt.ppp, 2)} · ${p.halfCourt.poss}` : "–"), "Pontos por posse · posses (outras jogadas com contexto)", "high"],
    ["Pontos 2.ª oportunidade" + (per > 1 ? " / jogo" : ""), (p) => f(p.secondChancePts / per, per > 1 ? 1 : 0), "Depois de um ressalto ofensivo", "high"],
  ];
  const num = (s: string) => parseFloat(s);

  return (
    <div className="card h-fit overflow-hidden">
      <div className="border-b border-line px-3 py-2">
        <h2 className="font-semibold">Posses</h2>
        <p className="text-xs text-muted">Calculadas a partir dos eventos: cada ataque conta uma vez, mesmo com ressaltos ofensivos.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th></th><th>Nós</th><th className="max-w-28 truncate text-opp!">{opponent}</th></tr></thead>
          <tbody>
            {rows.map(([label, get, hint, better]) => {
              const a = get(data.us), b = get(data.opp);
              const na = num(a), nb = num(b);
              const usBetter = better && !isNaN(na) && !isNaN(nb) && na !== nb ? (better === "high" ? na > nb : na < nb) : null;
              return (
                <tr key={label}>
                  <td className="text-muted" title={hint}>{label}</td>
                  <td className={usBetter === true ? "font-semibold text-good" : ""}>{a}</td>
                  <td className={usBetter === false ? "font-semibold text-opp" : ""}>{b}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
