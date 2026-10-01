/*
 * Following the practice plan live (v0.11) — pure functions, no storage, no UI.
 *
 * Model (types.ts → PracticeRun): one row per practice with what happened to each plan item, keyed by
 * PlanItem.id. Time is a list of segments {start, end}: pausing closes the open segment, resuming opens a
 * new one, so the effective time is the sum of the segments and an interrupted exercise keeps its time.
 * Only one exercise runs at a time: starting another one pauses the current one.
 *
 * The page (src/app/treinos/[id]/ao-vivo/view.tsx) calls these and saves the result with db.practice_runs.put().
 * Everything is local-first, so it works without internet at the gym and syncs later (sync.ts).
 */

import { L } from "./i18n";
import { uid } from "./db";
import type { PlanItem, PracticeRun, RunItem, RunSegment, RunStatus } from "./types";

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  todo: L("Por fazer"), running: L("A decorrer"), paused: L("Em pausa"), done: L("Concluído"), skipped: L("Não realizado"),
};

/** Plans saved before v0.11 have no item ids: give them one (the caller saves the plan back). */
export function withIds(plan: PlanItem[]): PlanItem[] {
  return plan.some((p) => !p.id) ? plan.map((p) => (p.id ? p : { ...p, id: uid() })) : plan;
}

export const emptyRun = (practiceId: string, teamId: string): PracticeRun => ({ id: practiceId, teamId, items: {}, createdAt: Date.now() });

/** The run state of one plan item (a fresh "todo" if nothing happened yet). */
export function itemOf(run: PracticeRun | undefined, p: PlanItem): RunItem {
  return run?.items[p.id!] ?? { status: "todo", name: p.name, plannedMin: p.minutes, segments: [] };
}

export const segMs = (s: RunSegment, now: number) => Math.max(0, (s.end ?? now) - s.start);
export const elapsedMs = (it: RunItem, now: number) => it.segments.reduce((a, s) => a + segMs(s, now), 0);
const closeOpen = (segs: RunSegment[], now: number) => segs.map((s) => (s.end === undefined ? { ...s, end: now } : s));

function put(run: PracticeRun, id: string, it: RunItem): PracticeRun {
  return { ...run, items: { ...run.items, [id]: it } };
}

/** Pauses whatever is running (used before starting another exercise and when the practice ends). */
function pauseAll(run: PracticeRun, now: number): PracticeRun {
  const items = { ...run.items };
  for (const [id, it] of Object.entries(items)) {
    if (it.status === "running") items[id] = { ...it, status: "paused", segments: closeOpen(it.segments, now) };
  }
  return { ...run, items };
}

/** Start (or resume) an exercise. The name/minutes snapshot is refreshed from the plan. */
export function start(run: PracticeRun, p: PlanItem, now: number): PracticeRun {
  const r = pauseAll(run, now);
  const it = itemOf(r, p);
  return put({ ...r, startedAt: r.startedAt ?? now, endedAt: undefined }, p.id!, {
    ...it, name: p.name, plannedMin: p.minutes, status: "running", segments: [...it.segments, { start: now }],
  });
}

export function pause(run: PracticeRun, p: PlanItem, now: number): PracticeRun {
  const it = itemOf(run, p);
  if (it.status !== "running") return run;
  return put(run, p.id!, { ...it, status: "paused", segments: closeOpen(it.segments, now) });
}

export function finish(run: PracticeRun, p: PlanItem, now: number): PracticeRun {
  const it = itemOf(run, p);
  return put({ ...run, startedAt: run.startedAt ?? now }, p.id!, { ...it, name: p.name, plannedMin: p.minutes, status: "done", segments: closeOpen(it.segments, now), reason: undefined });
}

/** Not done (or stopped early): keeps any time already logged, reason is optional. */
export function skip(run: PracticeRun, p: PlanItem, reason: string | undefined, now: number): PracticeRun {
  const it = itemOf(run, p);
  return put(run, p.id!, { ...it, name: p.name, plannedMin: p.minutes, status: "skipped", segments: closeOpen(it.segments, now), reason: reason?.trim() || undefined });
}

/** Undo "done"/"skipped": back to paused (time kept) or to do (no time). */
export function reopen(run: PracticeRun, p: PlanItem): PracticeRun {
  const it = itemOf(run, p);
  return put(run, p.id!, { ...it, status: it.segments.length ? "paused" : "todo", reason: undefined });
}

export function setNote(run: PracticeRun, p: PlanItem, note: string): PracticeRun {
  return put(run, p.id!, { ...itemOf(run, p), note: note.trim() || undefined });
}

/** Coach fixes times marked by mistake. Invalid segments (end before start) are dropped; at most one open, the last. */
export function setSegments(run: PracticeRun, p: PlanItem, segments: RunSegment[]): PracticeRun {
  const it = itemOf(run, p);
  const ok = segments
    .filter((s) => Number.isFinite(s.start) && (s.end === undefined || s.end >= s.start))
    .sort((a, b) => a.start - b.start)
    .map((s, i, all) => (i < all.length - 1 && s.end === undefined ? { ...s, end: all[i + 1].start } : s));
  const open = ok.length > 0 && ok[ok.length - 1].end === undefined;
  // done / skipped stay as they are; otherwise the status follows the corrected segments
  let status: RunStatus = it.status;
  if (open) status = "running";
  else if (it.status === "running" || it.status === "paused" || it.status === "todo") status = ok.length ? "paused" : "todo";
  return put(run, p.id!, { ...it, segments: ok, status });
}

export function endPractice(run: PracticeRun, note: string | undefined, now: number): PracticeRun {
  return { ...pauseAll(run, now), endedAt: now, note: note?.trim() || undefined };
}

/* ---------- summary: planned vs real ---------- */

export interface RunRow { id: string; name: string; plannedMin: number; realMin: number; status: RunStatus; note?: string; reason?: string; removed?: boolean }

/**
 * One row per plan item (plan order) + items that were logged and later removed from the plan (flagged `removed`).
 * realMin is rounded to 0.1 min. Totals count only effective time.
 */
export function summarize(plan: PlanItem[], run: PracticeRun | undefined, now: number) {
  const rows: RunRow[] = plan.filter((p) => p.id).map((p) => {
    const it = itemOf(run, p);
    return { id: p.id!, name: p.name, plannedMin: p.minutes, realMin: Math.round(elapsedMs(it, now) / 6000) / 10, status: it.status, note: it.note, reason: it.reason };
  });
  const inPlan = new Set(rows.map((r) => r.id));
  for (const [id, it] of Object.entries(run?.items ?? {})) {
    if (!inPlan.has(id)) rows.push({ id, name: it.name, plannedMin: 0, realMin: Math.round(elapsedMs(it, now) / 6000) / 10, status: it.status, note: it.note, reason: it.reason, removed: true });
  }
  const planned = rows.reduce((a, r) => a + r.plannedMin, 0);
  const real = rows.reduce((a, r) => a + r.realMin, 0);
  const count = (s: RunStatus) => rows.filter((r) => r.status === s).length;
  return { rows, planned, real: Math.round(real * 10) / 10, done: count("done"), skipped: count("skipped"), open: rows.length - count("done") - count("skipped") };
}

/** 754000 → "12:34"; over an hour → "1:02:34". */
export function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** epoch ms ↔ "HH:MM:SS" (local time, same day as `ref`) for the time-correction inputs. */
export const toTimeInput = (ms: number) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
};
export function fromTimeInput(value: string, ref: number): number | undefined {
  const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return undefined;
  const d = new Date(ref);
  d.setHours(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), 0);
  return d.getTime();
}
