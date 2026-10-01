"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { withIds } from "@/lib/practiceRun";
import { MediaStrip } from "./DrillMedia";
import { useSeason } from "@/lib/season";
import { suggestions } from "@/lib/planner";
import { FOCUS_LABEL, type Agenda, type PlanItem, type Practice } from "@/lib/types";
import { t } from "@/lib/i18n";

/** The plan of one practice (stored in its agenda row): exercises with minutes, reorderable. */
export function PracticePlan({ practice }: { practice: Practice }) {
  const info = useLiveQuery(() => db.agenda.get(practice.id), [practice.id]);
  const drills = useLiveQuery(() => db.drills.where("teamId").equals(practice.teamId).sortBy("name"), [practice.teamId]);
  const s = useSeason(practice.teamId);
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState({ name: "", minutes: "10" });
  if (info === undefined && drills === undefined) return null;

  const plan = info?.plan ?? [];
  const total = plan.reduce((a, p) => a + p.minutes, 0);
  const save = (next: PlanItem[]) => {
    const base: Agenda = info ?? { id: practice.id, teamId: practice.teamId, kind: "practice" };
    // v0.11: every item keeps a stable id (the live practice log points to it); old plans get ids here
    return db.agenda.put({ ...base, plan: withIds(next) });
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= plan.length) return;
    const next = [...plan];
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
  };
  const addDrill = (id: string) => {
    const d = drills?.find((x) => x.id === id);
    if (!d) return;
    void save([...plan, { id: uid(), drillId: d.id, name: d.name, minutes: d.minutes ?? 10, focus: d.focus }]);
    setPick("");
  };
  const addCustom = () => {
    if (!custom.name.trim()) return;
    void save([...plan, { id: uid(), name: custom.name.trim(), minutes: Number(custom.minutes) || 10 }]);
    setCustom({ name: "", minutes: "10" });
  };
  const sugg = s ? suggestions(s) : [];
  const suggested = (drills ?? []).filter((d) => d.focus.some((f) => sugg.some((x) => x.focus === f)) && !plan.some((p) => p.drillId === d.id)).slice(0, 4);

  return (
    <section className="card mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("Plano do treino")}</h2>
        {plan.length > 0 && <Link href={`/treinos/${practice.id}/ao-vivo`} className="btn btn-primary py-1 text-sm">▶ {t("Acompanhar ao vivo")}</Link>}
        <span className={`text-sm ${practice.durationMin && total > practice.durationMin ? "text-bad" : "text-muted"}`}>
          {practice.durationMin ? t("{n} min de {max}", { n: total, max: practice.durationMin }) : t("{n} min", { n: total })}
        </span>
      </div>

      <ol className="mt-2 grid gap-1.5">
        {plan.map((p, i) => (
          <li key={p.id ?? i} className="flex items-center gap-2 rounded-lg border border-line bg-bg/40 px-2 py-1.5">
            <span className="w-5 shrink-0 text-center font-mono text-xs text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name}</div>
              {p.focus?.length ? <div className="truncate text-[11px] text-muted">{p.focus.map((f) => t(FOCUS_LABEL[f])).join(" · ")}</div> : null}
            </div>
            {/* v0.11: the drill's attachments, one tap away while planning */}
            <MediaStrip compact media={drills?.find((d) => d.id === p.drillId)?.media} />
            <input className="input w-16 px-2 py-1 text-center" inputMode="numeric" aria-label={t("Minutos")} value={p.minutes}
              onChange={(e) => save(plan.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) || 0 } : x)))} />
            <div className="flex shrink-0">
              <button className="grid h-9 w-7 place-items-center text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Subir")}>↑</button>
              <button className="grid h-9 w-7 place-items-center text-muted hover:text-fg disabled:opacity-30" disabled={i === plan.length - 1} onClick={() => move(i, 1)} aria-label={t("Descer")}>↓</button>
              <button className="grid h-9 w-7 place-items-center text-muted hover:text-bad" onClick={() => save(plan.filter((_, j) => j !== i))} aria-label={t("Tirar do plano")}>✕</button>
            </div>
          </li>
        ))}
        {plan.length === 0 && <li className="text-sm text-muted">{t("Ainda sem exercícios neste treino.")}</li>}
      </ol>

      {suggested.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted">{t("Sugeridos pelos jogos ({areas})", { areas: sugg.map((x) => t(FOCUS_LABEL[x.focus]).toLowerCase()).join(", ") })}</div>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((d) => (
              <button key={d.id} className="rounded-full border border-brand/50 px-2.5 py-1 text-xs text-brand hover:bg-brand/10 pointer-coarse:py-1.5" onClick={() => addDrill(d.id)}>+ {d.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select className="input" value={pick} onChange={(e) => addDrill(e.target.value)} aria-label={t("Adicionar exercício da biblioteca")}>
          <option value="">{t("+ Da biblioteca…")}</option>
          {(drills ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.minutes ? ` (${d.minutes}′)` : ""}</option>)}
        </select>
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" placeholder={t("Outro exercício")} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
          <input className="input w-16 px-2 text-center" inputMode="numeric" aria-label={t("Minutos")} value={custom.minutes} onChange={(e) => setCustom({ ...custom, minutes: e.target.value })} />
          <button className="btn" onClick={addCustom} aria-label={t("Adicionar")}>+</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {drills?.length ? "" : `${t("A biblioteca está vazia.")} `}
        <Link href="/treinos/exercicios" className="text-brand">{t("Gerir exercícios →")}</Link>
      </p>
    </section>
  );
}
