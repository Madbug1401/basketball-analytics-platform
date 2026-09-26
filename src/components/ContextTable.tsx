"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtPct, ppp, tagStats } from "@/lib/stats";
import { PLAY_TAGS, type GameEvent } from "@/lib/types";

const LABEL = Object.fromEntries(PLAY_TAGS.map((t) => [t.id, t.label]));

/** Efficiency by play context (tags). Renders nothing if no play was tagged. */
export function ContextTable({ events, gameId, opponent = "Adversário" }: { events: GameEvent[]; gameId?: string; opponent?: string }) {
  const [side, setSide] = useState<"us" | "opp">("us");
  const us = tagStats(events, "us");
  const opp = tagStats(events, "opp");
  if (!us.tagged && !opp.tagged) return null;
  const data = side === "us" ? us : opp;

  return (
    <div className="card h-fit overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">Contexto das jogadas</h2>
          <p className="text-xs text-muted">{data.tagged} de {data.total} jogadas com contexto marcado.</p>
        </div>
        <div className="flex gap-1">
          <button className={`btn py-1 text-xs ${side === "us" ? "btn-primary" : ""}`} onClick={() => setSide("us")}>Nós</button>
          <button className={`btn max-w-32 truncate py-1 text-xs ${side === "opp" ? "btn-primary" : ""}`} onClick={() => setSide("opp")}>{opponent}</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Contexto</th><th>Jogadas</th><th>Pts</th><th title="Pontos por jogada">Pts/jog.</th><th>LC</th><th>Perdas</th>{gameId && <th className="print:hidden"></th>}</tr></thead>
          <tbody>
            {data.tags.map((t) => {
              const v = t.plays ? t.pts / t.plays : 0;
              return (
                <tr key={t.tag}>
                  <td className="whitespace-nowrap">{LABEL[t.tag]}</td>
                  <td>{Math.round(t.plays)}</td>
                  <td>{t.pts}</td>
                  <td className={v >= 1.05 ? "font-semibold text-good" : v <= 0.75 ? "text-bad" : ""}>{ppp(t)}</td>
                  <td className="whitespace-nowrap">{t.fgm}/{t.fga} <span className="text-muted">{fmtPct(t.fgm, t.fga)}</span></td>
                  <td>{t.tov}</td>
                  {gameId && (
                    <td className="print:hidden">
                      <Link className="tap justify-center px-2 text-xs text-brand" href={`/jogos/${gameId}/logger?${new URLSearchParams({ lado: side, contexto: t.tag, play: "1" })}`} aria-label="Ver jogadas">▶ Ver</Link>
                    </td>
                  )}
                </tr>
              );
            })}
            {data.tags.length === 0 && <tr><td colSpan={gameId ? 7 : 6} className="py-6 text-center! text-muted">Sem jogadas marcadas deste lado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
