"use client";

import { useMemo } from "react";
import { possessions, profile, type SideProfile } from "@/lib/possessions";
import type { GameEvent } from "@/lib/types";
import { t } from "@/lib/i18n";

const f = (v: number | null, d = 0, suf = "") => (v === null ? "–" : `${v.toFixed(d)}${suf}`);

/** Possession-based profile of both teams (one game or a whole season). */
export function PossessionTable({ games, opponent = t("Adversário") }: { games: { events: GameEvent[] }[]; opponent?: string }) {
  const data = useMemo(() => {
    const events = games.flatMap((g) => g.events);
    const poss = games.flatMap((g) => possessions(g.events));
    return { us: profile(events, poss, "us"), opp: profile(events, poss, "opp"), n: games.filter((g) => g.events.length).length };
  }, [games]);
  if (!data.us.poss && !data.opp.poss) return null;
  const per = data.n > 1 ? data.n : 1;

  const rows: [string, (p: SideProfile) => string, string, "high" | "low" | null][] = [
    [per > 1 ? t("Posses / jogo") : t("Posses"), (p) => f(p.poss / per, per > 1 ? 1 : 0), t("Número de ataques (o ritmo do jogo)"), null],
    [t("Pontos por posse"), (p) => f(p.ppp, 2), t("A medida mais completa de eficiência"), "high"],
    ["eFG%", (p) => f(p.efg, 0, "%"), t("Lançamentos de campo com o triplo a valer 1,5"), "high"],
    [t("% perdas"), (p) => f(p.tovPct, 0, "%"), t("Posses que acabam em perda de bola"), "low"],
    [t("% ressalto ofensivo"), (p) => f(p.orebPct, 0, "%"), t("Dos ressaltos ofensivos disponíveis"), "high"],
    [t("LL por lançamento"), (p) => f(p.ftRate, 2), t("Tentativas de lance livre por lançamento de campo"), "high"],
    [t("Transição"), (p) => (p.transition.poss ? `${f(p.transition.ppp, 2)} · ${p.transition.poss}` : "–"), t("Pontos por posse · posses (jogadas marcadas como transição)"), "high"],
    [t("Ataque organizado"), (p) => (p.halfCourt.poss ? `${f(p.halfCourt.ppp, 2)} · ${p.halfCourt.poss}` : "–"), t("Pontos por posse · posses (outras jogadas com contexto)"), "high"],
    [per > 1 ? t("Pontos 2.ª oportunidade / jogo") : t("Pontos 2.ª oportunidade"), (p) => f(p.secondChancePts / per, per > 1 ? 1 : 0), t("Depois de um ressalto ofensivo"), "high"],
  ];
  const num = (s: string) => parseFloat(s);

  return (
    <div className="card h-fit overflow-hidden">
      <div className="border-b border-line px-3 py-2">
        <h2 className="font-semibold">{t("Posses")}</h2>
        <p className="text-xs text-muted">{t("Calculadas a partir dos eventos: cada ataque conta uma vez, mesmo com ressaltos ofensivos.")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th></th><th>{t("Nós")}</th><th className="max-w-28 truncate text-opp!">{opponent}</th></tr></thead>
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
