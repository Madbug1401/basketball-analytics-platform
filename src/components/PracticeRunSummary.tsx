"use client";

import { useState } from "react";
import { RUN_STATUS_LABEL, summarize } from "@/lib/practiceRun";
import type { PlanItem, PracticeRun, RunStatus } from "@/lib/types";
import { t } from "@/lib/i18n";

const TONE: Record<RunStatus, string> = {
  todo: "text-muted", running: "text-good", paused: "text-brand", done: "text-good", skipped: "text-bad",
};

const fmtMin = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", ","));

/**
 * Planned vs real for one practice (v0.11, feedback ABC point 1: "duração prevista, duração real, estado e nota").
 * Used at the bottom of the live page and on the practice page once something was logged.
 */
export function PracticeRunSummary({ plan, run, now }: { plan: PlanItem[]; run?: PracticeRun; now?: number }) {
  const [openedAt] = useState(() => Date.now()); // without a ticking `now` (practice page): time as of opening
  const s = summarize(plan, run, now ?? openedAt);
  if (!run || !Object.keys(run.items).length) return null;
  const diff = Math.round((s.real - s.planned) * 10) / 10;
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("Previsto vs real")}</h2>
        <span className="text-sm text-muted">
          {t("{done} concluídos · {skipped} não realizados · {open} por fazer", { done: s.done, skipped: s.skipped, open: s.open })}
        </span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>{t("Exercício")}</th><th>{t("Previsto")}</th><th>{t("Real")}</th><th>{t("Dif.")}</th><th className="hidden sm:table-cell">{t("Estado")}</th></tr></thead>
          <tbody>
            {s.rows.map((r) => {
              const d = Math.round((r.realMin - r.plannedMin) * 10) / 10;
              return (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium">{r.name}{r.removed && <span className="ml-1 text-[10px] text-muted">{t("(já não está no plano)")}</span>}</div>
                    {/* phone: the status goes under the name (the column is hidden) */}
                    <div className={`text-[11px] sm:hidden ${TONE[r.status]}`}>{t(RUN_STATUS_LABEL[r.status])}</div>
                    {(r.reason || r.note) && <div className="max-w-xs whitespace-normal text-xs text-muted">{[r.reason && t("Motivo: {text}", { text: r.reason }), r.note].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td>{fmtMin(r.plannedMin)}′</td>
                  <td>{r.realMin || r.status !== "todo" ? `${fmtMin(r.realMin)}′` : "–"}</td>
                  <td className={r.status === "todo" ? "text-muted" : d > 0 ? "text-brand" : ""}>{r.status === "todo" ? "–" : `${d > 0 ? "+" : ""}${fmtMin(d)}′`}</td>
                  <td className={`hidden sm:table-cell ${TONE[r.status]}`}>{t(RUN_STATUS_LABEL[r.status])}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td>{t("Total")}</td>
              <td>{fmtMin(s.planned)}′</td>
              <td>{fmtMin(s.real)}′</td>
              <td className={diff > 0 ? "text-brand" : ""}>{`${diff > 0 ? "+" : ""}${fmtMin(diff)}′`}</td>
              <td className="hidden sm:table-cell"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{t("Real = tempo efetivo (sem as pausas). A diferença mostra onde o treino se adaptou ao que aconteceu.")}</p>
      {run.note && <p className="mt-2 whitespace-pre-line rounded-lg bg-panel-2 p-2 text-sm"><b>{t("Nota do treino:")}</b> {run.note}</p>}
    </section>
  );
}
