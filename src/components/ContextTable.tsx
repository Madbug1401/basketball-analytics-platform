"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtPct, ppp, tagStats } from "@/lib/stats";
import { PLAY_TAGS, type GameEvent } from "@/lib/types";
import { t } from "@/lib/i18n";

const LABEL = Object.fromEntries(PLAY_TAGS.map((tag) => [tag.id, tag.label]));

/** Efficiency by play context (tags). Renders nothing if no play was tagged. */
export function ContextTable({ events, gameId, opponent = t("Adversário") }: { events: GameEvent[]; gameId?: string; opponent?: string }) {
  const [side, setSide] = useState<"us" | "opp">("us");
  const us = tagStats(events, "us");
  const opp = tagStats(events, "opp");
  if (!us.tagged && !opp.tagged) return null;
  const data = side === "us" ? us : opp;

  return (
    <div className="card h-fit overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">{t("Contexto das jogadas")}</h2>
          <p className="text-xs text-muted">{t("{n} de {total} jogadas com contexto marcado.", { n: data.tagged, total: data.total })}</p>
        </div>
        <div className="flex gap-1">
          <button className={`btn py-1 text-xs ${side === "us" ? "btn-primary" : ""}`} onClick={() => setSide("us")}>{t("Nós")}</button>
          <button className={`btn max-w-32 truncate py-1 text-xs ${side === "opp" ? "btn-primary" : ""}`} onClick={() => setSide("opp")}>{opponent}</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>{t("Contexto")}</th><th>{t("Jogadas")}</th><th>{t("Pts")}</th><th title={t("Pontos por jogada")}>{t("Pts/jog.")}</th><th>{t("LC")}</th><th>{t("Perdas")}</th>{gameId && <th className="print:hidden"></th>}</tr></thead>
          <tbody>
            {data.tags.map((tg) => {
              const v = tg.plays ? tg.pts / tg.plays : 0;
              const label = LABEL[tg.tag];
              return (
                <tr key={tg.tag}>
                  <td className="whitespace-nowrap">{label ? t(label) : tg.tag}</td>
                  <td>{Math.round(tg.plays)}</td>
                  <td>{tg.pts}</td>
                  <td className={v >= 1.05 ? "font-semibold text-good" : v <= 0.75 ? "text-bad" : ""}>{ppp(tg)}</td>
                  <td className="whitespace-nowrap">{tg.fgm}/{tg.fga} <span className="text-muted">{fmtPct(tg.fgm, tg.fga)}</span></td>
                  <td>{tg.tov}</td>
                  {gameId && (
                    <td className="print:hidden">
                      <Link className="tap justify-center px-2 text-xs text-brand" href={`/jogos/${gameId}/logger?${new URLSearchParams({ lado: side, contexto: tg.tag, play: "1" })}`} aria-label={t("Ver jogadas")}>▶ {t("Ver")}</Link>
                    </td>
                  )}
                </tr>
              );
            })}
            {data.tags.length === 0 && <tr><td colSpan={gameId ? 7 : 6} className="py-6 text-center! text-muted">{t("Sem jogadas marcadas deste lado.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
