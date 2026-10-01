"use client";

/*
 * Follow the practice plan live (v0.11 — feedback ABC point 1).
 * The coach opens the plan during practice and, per exercise: Iniciar / Pausa / Retomar / Concluir /
 * Não realizado (optional reason), a short note, and "Corrigir horas" for times marked by mistake.
 * At the end: a general note and "Terminar treino"; the summary shows planned vs real.
 *
 * - State: one PracticeRun row per practice (types.ts), changed only through the pure functions in
 *   src/lib/practiceRun.ts and saved with db.practice_runs.put → local first, works offline, syncs later.
 * - The plan itself (agenda.plan) is not changed here, except giving ids to plans created before v0.11.
 * - Concurrency: last write wins on the whole row. Meant for one coach logging at a time (normal use);
 *   two devices logging the same practice at the same moment could overwrite each other's last tap.
 * - Screen stays on while an exercise runs (Wake Lock, like the live game mode).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouteId } from "@/lib/route";
import { db } from "@/lib/db";
import { StaffOnly } from "@/components/Guard";
import { askText } from "@/components/Dialog";
import { MediaStrip } from "@/components/DrillMedia";
import { PracticeRunSummary } from "@/components/PracticeRunSummary";
import {
  RUN_STATUS_LABEL, elapsedMs, emptyRun, endPractice, finish, fmtClock, fromTimeInput, itemOf, pause, reopen,
  setNote, setSegments, skip, start, summarize, toTimeInput, withIds,
} from "@/lib/practiceRun";
import { FOCUS_LABEL, type PlanItem, type PracticeRun, type RunSegment, type RunStatus } from "@/lib/types";
import { locale, t } from "@/lib/i18n";

const BADGE: Record<RunStatus, string> = {
  todo: "border-line text-muted",
  running: "border-good bg-good/15 text-good",
  paused: "border-brand bg-brand/15 text-brand",
  done: "border-good/60 text-good",
  skipped: "border-bad/60 text-bad",
};

export function PracticeLiveGuarded() {
  return <StaffOnly><PracticeLive /></StaffOnly>;
}

function PracticeLive() {
  const id = useRouteId();
  const data = useLiveQuery(async () => {
    const practice = await db.practices.get(id);
    if (!practice) return { practice: null };
    const [info, run, drills] = await Promise.all([
      db.agenda.get(id),
      db.practice_runs.get(id),
      db.drills.where("teamId").equals(practice.teamId).toArray(),
    ]);
    return { practice, info, run, drills };
  }, [id]);

  const plan = data?.info?.plan;
  const running = !!data?.run && Object.values(data.run.items).some((it) => it.status === "running");

  // a clock that ticks only while an exercise runs (and catches up once when something starts/stops)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    if (!running) return () => clearTimeout(first);
    const h = setInterval(sync, 1000);
    return () => { clearTimeout(first); clearInterval(h); };
  }, [running, data?.run]);

  // keep the screen on while an exercise runs (same as the live game mode)
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, [running]);

  // plans made before v0.11 have no item ids: give them ids once (the run is keyed by them)
  useEffect(() => {
    if (data?.info?.plan && data.info.plan.some((p) => !p.id)) void db.agenda.put({ ...data.info, plan: withIds(data.info.plan) });
  }, [data?.info]);

  const [editing, setEditing] = useState<{ id: string; kind: "note" | "times" } | null>(null);
  const [generalNote, setGeneralNote] = useState<string | null>(null);

  if (!data) return null;
  if (!data.practice) return <p className="text-muted">{t("Treino não encontrado.")}</p>;
  const { practice, run, drills = [] } = data;
  const items = (plan ?? []).filter((p) => p.id);
  const base: PracticeRun = run ?? emptyRun(practice.id, practice.teamId);
  const save = (next: PracticeRun) => db.practice_runs.put(next);
  // `now` only moves while something runs; closed segments don't depend on it
  const tnow = now;
  const s = summarize(items, run, tnow);
  const totalMs = Object.values(base.items).reduce((a, it) => a + elapsedMs(it, tnow), 0);
  const note = generalNote ?? run?.note ?? "";

  const doSkip = async (p: PlanItem) => {
    const reason = await askText(t("Porque não foi realizado? (opcional)"), { confirmText: t("Marcar como não realizado") });
    if (reason === null) return;
    await save(skip(base, p, reason, Date.now()));
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <Link href={`/treinos/${practice.id}`} className="tap text-sm text-muted hover:text-fg">← {t("Treino")}</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{practice.title || t("Treino")}</h1>
            <p className="text-sm text-muted">
              {new Date(practice.date + "T12:00").toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })}
              {run?.startedAt && ` · ${t("começou às {time}", { time: new Date(run.startedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) })}`}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-semibold tabular-nums">{fmtClock(totalMs)}</div>
            <div className="text-xs text-muted">{t("efetivo · previsto {n} min", { n: s.planned })}</div>
          </div>
        </div>
        {run?.endedAt && (
          <p className="mt-2 rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">
            {t("Treino terminado às {time}. Podes continuar a corrigir os registos.", { time: new Date(run.endedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) })}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">
          <p>{t("Este treino ainda não tem plano.")}</p>
          <Link href={`/treinos/${practice.id}`} className="btn btn-primary mt-3">{t("Montar o plano")}</Link>
        </div>
      ) : (
        <ol className="grid gap-2">
          {items.map((p, i) => {
            const it = itemOf(run, p);
            const ms = elapsedMs(it, tnow);
            const over = it.status !== "todo" && ms > p.minutes * 60000;
            const media = drills.find((d) => d.id === p.drillId)?.media;
            const ed = editing && editing.id === p.id ? editing.kind : null;
            return (
              <li key={p.id} className={`card p-3 ${it.status === "running" ? "border-good ring-1 ring-good/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-center font-mono text-xs text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE[it.status]}`}>{t(RUN_STATUS_LABEL[it.status])}</span>
                    </div>
                    {p.focus?.length ? <div className="truncate text-[11px] text-muted">{p.focus.map((f) => t(FOCUS_LABEL[f])).join(" · ")}</div> : null}
                    {it.reason && <div className="text-xs text-bad">{t("Motivo: {text}", { text: it.reason })}</div>}
                    {it.note && ed !== "note" && <div className="text-xs text-muted">📝 {it.note}</div>}
                  </div>
                  <MediaStrip compact media={media} />
                  <div className="shrink-0 text-right">
                    <div className={`font-mono text-lg tabular-nums ${over ? "text-brand" : ""}`}>{fmtClock(ms)}</div>
                    <div className="text-[11px] text-muted">{t("de {n} min", { n: p.minutes })}</div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(it.status === "todo" || it.status === "paused") && (
                    <button className="btn btn-primary flex-1 sm:flex-none" onClick={() => save(start(base, p, Date.now()))}>
                      ▶ {it.status === "todo" ? t("Iniciar") : t("Retomar")}
                    </button>
                  )}
                  {it.status === "running" && <button className="btn flex-1 sm:flex-none" onClick={() => save(pause(base, p, Date.now()))}>⏸ {t("Pausa")}</button>}
                  {(it.status === "todo" || it.status === "running" || it.status === "paused") && (
                    <button className="btn flex-1 border-good text-good sm:flex-none" onClick={() => save(finish(base, p, Date.now()))}>✓ {t("Concluir")}</button>
                  )}
                  {(it.status === "todo" || it.status === "paused") && <button className="btn flex-1 sm:flex-none" onClick={() => void doSkip(p)}>{t("Não realizado")}</button>}
                  {(it.status === "done" || it.status === "skipped") && <button className="btn flex-1 sm:flex-none" onClick={() => save(reopen(base, p))}>↺ {t("Reabrir")}</button>}
                  <button className="btn btn-ghost px-2.5" onClick={() => setEditing(ed === "note" ? null : { id: p.id!, kind: "note" })} aria-expanded={ed === "note"}>📝 {t("Nota")}</button>
                  {it.segments.length > 0 && (
                    <button className="btn btn-ghost px-2.5" onClick={() => setEditing(ed === "times" ? null : { id: p.id!, kind: "times" })} aria-expanded={ed === "times"}>🕒 {t("Corrigir horas")}</button>
                  )}
                </div>

                {ed === "note" && (
                  <NoteEditor initial={it.note ?? ""} onSave={(v) => { void save(setNote(base, p, v)); setEditing(null); }} onCancel={() => setEditing(null)} />
                )}
                {ed === "times" && (
                  <TimesEditor segments={it.segments} refDay={it.segments[0]?.start ?? now}
                    onSave={(segs) => { void save(setSegments(base, p, segs)); setEditing(null); }} onCancel={() => setEditing(null)} />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {items.length > 0 && (
        <section className="card grid gap-2 p-4">
          <label className="label" htmlFor="run-note">{t("Nota geral do treino")}</label>
          <textarea id="run-note" className="input" rows={3} value={note} placeholder={t("O que mudou face ao plano e porquê…")}
            onChange={(e) => setGeneralNote(e.target.value)}
            onBlur={() => { if (generalNote !== null && generalNote !== (run?.note ?? "")) void save({ ...base, note: generalNote.trim() || undefined }); }} />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => { void save(endPractice(base, note, Date.now())); setGeneralNote(null); }}>
              {run?.endedAt ? t("Guardar nota") : t("Terminar treino")}
            </button>
            <span className="self-center text-xs text-muted">{t("Terminar pausa o exercício em curso. Tudo fica guardado neste dispositivo e sincroniza quando houver rede.")}</span>
          </div>
        </section>
      )}

      <PracticeRunSummary plan={items} run={run} now={tnow} />
    </div>
  );
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-2 grid gap-2">
      <textarea className="input" rows={2} autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={t("Ex.: menos tempo porque faltaram 3 jogadores")} />
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => onSave(v)}>{t("Guardar")}</button>
        <button className="btn" onClick={onCancel}>{t("Cancelar")}</button>
      </div>
    </div>
  );
}

/**
 * Fix times marked by mistake: each segment is a start/end pair (HH:MM:SS, same day as the first one).
 * An empty end on the last line means "still running". Invalid lines are dropped by setSegments().
 */
function TimesEditor({ segments, refDay, onSave, onCancel }: { segments: RunSegment[]; refDay: number; onSave: (s: RunSegment[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState(() => segments.map((s) => ({ start: toTimeInput(s.start), end: s.end === undefined ? "" : toTimeInput(s.end) })));
  const parsed = rows.map((r) => ({ start: fromTimeInput(r.start, refDay), end: r.end ? fromTimeInput(r.end, refDay) : undefined, open: !r.end }));
  const bad = parsed.some((p) => p.start === undefined || (!p.open && (p.end === undefined || p.end < p.start!)));
  const total = parsed.reduce((a, p) => a + (p.start !== undefined && p.end !== undefined && p.end >= p.start ? p.end - p.start : 0), 0);
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-line bg-bg/40 p-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] uppercase text-muted"><span>{t("Início")}</span><span>{t("Fim")}</span><span /></div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <input type="time" step={1} className="input px-2 py-1" aria-label={t("Início")} value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <input type="time" step={1} className="input px-2 py-1" aria-label={t("Fim")} value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
          <button className="grid h-9 w-8 place-items-center text-muted hover:text-bad" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t("Tirar")}>✕</button>
        </div>
      ))}
      <p className="text-[11px] text-muted">{t("Cada linha é um período a contar; os intervalos entre linhas são pausas. Fim vazio = ainda a decorrer. Total: {time}", { time: fmtClock(total) })}</p>
      {bad && <p className="text-xs text-bad">{t("Verifica as horas: o fim tem de ser depois do início.")}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={bad}
          onClick={() => onSave(parsed.map((p) => ({ start: p.start!, end: p.open ? undefined : p.end })))}>{t("Guardar horas")}</button>
        <button className="btn" onClick={() => { const last = rows[rows.length - 1]; const st = last?.end || last?.start || toTimeInput(Date.now()); setRows([...rows, { start: st, end: st }]); }}>{t("+ Período")}</button>
        <button className="btn" onClick={onCancel}>{t("Cancelar")}</button>
      </div>
    </div>
  );
}
