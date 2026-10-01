"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteId } from "@/lib/route";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ATTENDANCE_LABEL, type AttendanceStatus, type Practice } from "@/lib/types";
import { StaffOnly } from "@/components/Guard";
import { PracticePlan } from "@/components/PracticePlan";
import { PracticeRunSummary } from "@/components/PracticeRunSummary";
import { confirmDeletePractice } from "@/components/DeletePractice";
import { t } from "@/lib/i18n";

const ORDER: AttendanceStatus[] = ["present", "late", "absent", "excused"];
const STYLE: Record<AttendanceStatus, string> = {
  present: "border-good bg-good/15 text-good",
  late: "border-brand bg-brand/15 text-brand",
  absent: "border-bad bg-bad/15 text-bad",
  excused: "border-opp bg-opp/15 text-opp",
};

export function PracticeDetailGuarded() {
  return <StaffOnly><PracticeDetail /></StaffOnly>;
}

function PracticeDetail() {
  const id = useRouteId();
  const router = useRouter();
  const data = useLiveQuery(async () => {
    const practice = await db.practices.get(id);
    if (!practice) return { practice: null };
    const [players, attendance, rsvps, info, run] = await Promise.all([
      db.players.where("teamId").equals(practice.teamId).filter((p) => p.active).sortBy("number"),
      db.attendance.where("practiceId").equals(id).toArray(),
      db.rsvps.where("refId").equals(id).toArray(),
      db.agenda.get(id),
      db.practice_runs.get(id), // v0.11: how it went (logged in /treinos/<id>/ao-vivo)
    ]);
    return { practice, players, attendance, rsvps, info, run };
  }, [id]);

  if (!data) return null;
  if (!data.practice) return <p className="text-muted">{t("Treino não encontrado.")}</p>;
  const { practice, players = [], attendance = [], rsvps = [], info, run } = data;
  const answers = new Map(rsvps.map((r) => [r.playerId, r]));
  const status = new Map(attendance.map((a) => [a.playerId, a]));

  const set = (playerId: string, s: AttendanceStatus) =>
    db.attendance.put({ id: `${id}:${playerId}`, teamId: practice.teamId, practiceId: id, playerId, status: s, note: status.get(playerId)?.note });
  const allPresent = () =>
    db.attendance.bulkPut(players.filter((p) => !status.has(p.id)).map((p) => ({ id: `${id}:${p.id}`, teamId: practice.teamId, practiceId: id, playerId: p.id, status: "present" as const })));
  const upd = (patch: Partial<Practice>) => db.practices.update(id, patch);

  const count = (s: AttendanceStatus) => attendance.filter((a) => a.status === s).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/treinos" className="tap text-sm text-muted hover:text-fg">← {t("Treinos")}</Link>
      <div className="card mt-3 grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">{t("Título")}</label>
          <input className="input" value={practice.title ?? ""} onChange={(e) => upd({ title: e.target.value })} />
        </div>
        <div>
          <label className="label">{t("Data")}</label>
          <input type="date" className="input" value={practice.date} onChange={(e) => upd({ date: e.target.value })} />
        </div>
        <div>
          <label className="label">{t("Duração (min)")}</label>
          <input className="input" inputMode="numeric" value={practice.durationMin ?? ""} onChange={(e) => upd({ durationMin: Number(e.target.value) || undefined })} />
        </div>
        <div className="sm:col-span-4">
          <label className="label">{t("Intensidade")}</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`btn w-10 ${practice.intensity === n ? "btn-primary" : ""}`} onClick={() => upd({ intensity: n as 1 })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-4">
          <label className="label">{t("Exercícios / observações")}</label>
          <textarea className="input" rows={3} value={practice.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })}
            placeholder={t("Ex.: 3x2 transição, pick & roll defensivo, lançamento 5 spots…")} />
        </div>
      </div>

      <PracticePlan practice={practice} />
      {run && <div className="mt-4"><PracticeRunSummary plan={(info?.plan ?? []).filter((p) => p.id)} run={run} /></div>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("Presenças")}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          {ORDER.map((s) => <span key={s}>{t(ATTENDANCE_LABEL[s])}: <b className="text-fg">{count(s)}</b></span>)}
          <button className="btn" onClick={allPresent}>{t("Restantes presentes")}</button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {players.map((p) => {
          const cur = status.get(p.id)?.status;
          return (
            <div key={p.id} className="card flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-panel-2 font-mono font-semibold">{p.number}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {p.name}
                {answers.get(p.id) && (
                  <span className={`ml-2 text-xs font-normal ${answers.get(p.id)!.status === "yes" ? "text-good" : answers.get(p.id)!.status === "no" ? "text-bad" : "text-brand"}`}
                    title={answers.get(p.id)!.note}>
                    {answers.get(p.id)!.status === "yes" ? t("disse que vinha") : answers.get(p.id)!.status === "no" ? `${t("avisou que não vinha")}${answers.get(p.id)!.note ? ` (${answers.get(p.id)!.note})` : ""}` : t("talvez")}
                  </span>
                )}
              </span>
              <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto">
                {ORDER.map((s) => (
                  <button key={s} onClick={() => set(p.id, s)}
                    className={`rounded-lg border px-1 py-2 text-xs sm:px-3 sm:text-sm ${cur === s ? STYLE[s] : "border-line text-muted hover:text-fg"}`}>
                    {t(ATTENDANCE_LABEL[s])}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {players.length === 0 && <p className="text-muted">{t("Adiciona jogadores no")} <Link className="text-brand" href="/equipa">{t("Plantel")}</Link>.</p>}
      </div>

      <button className="btn btn-danger mt-8" onClick={async () => { if (await confirmDeletePractice(practice)) router.push("/treinos"); }}>
        {t("Apagar treino")}
      </button>
    </div>
  );
}
