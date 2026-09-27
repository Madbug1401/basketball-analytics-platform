"use client";

import Link from "next/link";
import type { ID, Player } from "@/lib/types";
import { eff, fmtMin, fmtPct, reb, type Line } from "@/lib/stats";
import { t } from "@/lib/i18n";

export function BoxTable({
  rows,
  total,
  perGame = false,
}: {
  rows: { p: Player; l: Line }[];
  total?: Line;
  perGame?: boolean;
}) {
  const f = (v: number, gp: number) => (perGame ? (gp ? (v / gp).toFixed(1) : "–") : String(v));
  const cells = (l: Line, gp: number) => (
    <>
      {perGame && <td>{l.gp}</td>}
      <td className="text-muted">{perGame ? (gp && l.min ? (l.min / gp).toFixed(1) : "–") : fmtMin(l.min)}</td>
      <td className="font-semibold">{f(l.pts, gp)}</td>
      <td>{perGame ? f(l.fgm, gp) + "/" + f(l.fga, gp) : `${l.fgm}/${l.fga}`}</td>
      <td className="text-muted">{fmtPct(l.fgm, l.fga)}</td>
      <td>{perGame ? f(l.p3m, gp) + "/" + f(l.p3a, gp) : `${l.p3m}/${l.p3a}`}</td>
      <td className="text-muted">{fmtPct(l.p3m, l.p3a)}</td>
      <td>{perGame ? f(l.ftm, gp) + "/" + f(l.fta, gp) : `${l.ftm}/${l.fta}`}</td>
      <td className="text-muted">{fmtPct(l.ftm, l.fta)}</td>
      <td>{f(l.oreb, gp)}</td>
      <td>{f(l.dreb, gp)}</td>
      <td>{f(reb(l), gp)}</td>
      <td>{f(l.ast, gp)}</td>
      <td>{f(l.stl, gp)}</td>
      <td>{f(l.blk, gp)}</td>
      <td>{f(l.tov, gp)}</td>
      <td>{f(l.pf, gp)}</td>
      <td className={l.pm > 0 ? "text-good" : l.pm < 0 ? "text-bad" : ""}>{perGame ? f(l.pm, gp) : (l.pm > 0 ? "+" : "") + l.pm}</td>
      <td>{f(eff(l), gp)}</td>
    </>
  );
  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("Jogador")}</th>{perGame && <th>{t("J")}</th>}<th title={t("Minutos estimados pelo tempo de vídeo")}>{t("MIN")}</th><th>{t("PTS")}</th><th>{t("LC")}</th><th>%</th><th>{t("3P")}</th><th>%</th><th>{t("LL")}</th><th>%</th>
            <th>{t("RO")}</th><th>{t("RD")}</th><th>{t("RT")}</th><th>{t("AST")}</th><th>{t("ROU")}</th><th>{t("DES")}</th><th>{t("PB")}</th><th>{t("F")}</th><th>+/-</th><th>{t("EF")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, l }) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap">
                <Link href={`/jogadores/${p.id}`} className="-my-1 inline-block py-1 hover:text-brand pointer-coarse:py-2">
                  <span className="mr-2 inline-block w-6 font-mono text-muted">{p.number}</span>{p.name}
                </Link>
              </td>
              {cells(l, perGame ? l.gp : 1)}
            </tr>
          ))}
          {total && (
            <tr className="bg-panel-2/60 font-semibold">
              <td>{t("Equipa")}</td>
              {cells(total, perGame ? total.gp : 1)}
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        {t("LC lançamentos de campo · RO/RD/RT ressaltos of./def./total · ROU roubos · DES desarmes · PB perdas de bola · EF eficiência (PTS+RT+AST+ROU+DES−falhados−PB) · MIN estimados pelo tempo de vídeo (±1–2 min)")}
      </p>
    </div>
  );
}

export function sortRows(players: Player[], lines: Map<ID, Line>) {
  return players
    .filter((p) => lines.has(p.id))
    .map((p) => ({ p, l: lines.get(p.id)! }))
    .sort((a, b) => a.p.number - b.p.number);
}
