"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteId } from "@/lib/route";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deletePractice } from "@/lib/db";
import { ATTENDANCE_LABEL, type AttendanceStatus, type Practice } from "@/lib/types";
import { StaffOnly } from "@/components/Guard";
import { ask } from "@/components/Dialog";

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
    const [players, attendance] = await Promise.all([
      db.players.where("teamId").equals(practice.teamId).filter((p) => p.active).sortBy("number"),
      db.attendance.where("practiceId").equals(id).toArray(),
    ]);
    return { practice, players, attendance };
  }, [id]);

  if (!data) return null;
  if (!data.practice) return <p className="text-muted">Treino não encontrado.</p>;
  const { practice, players = [], attendance = [] } = data;
  const status = new Map(attendance.map((a) => [a.playerId, a]));

  const set = (playerId: string, s: AttendanceStatus) =>
    db.attendance.put({ id: `${id}:${playerId}`, teamId: practice.teamId, practiceId: id, playerId, status: s, note: status.get(playerId)?.note });
  const allPresent = () =>
    db.attendance.bulkPut(players.filter((p) => !status.has(p.id)).map((p) => ({ id: `${id}:${p.id}`, teamId: practice.teamId, practiceId: id, playerId: p.id, status: "present" as const })));
  const upd = (patch: Partial<Practice>) => db.practices.update(id, patch);

  const count = (s: AttendanceStatus) => attendance.filter((a) => a.status === s).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/treinos" className="tap text-sm text-muted hover:text-fg">← Treinos</Link>
      <div className="card mt-3 grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Título</label>
          <input className="input" value={practice.title ?? ""} onChange={(e) => upd({ title: e.target.value })} />
        </div>
        <div>
          <label className="label">Data</label>
          <input type="date" className="input" value={practice.date} onChange={(e) => upd({ date: e.target.value })} />
        </div>
        <div>
          <label className="label">Duração (min)</label>
          <input className="input" inputMode="numeric" value={practice.durationMin ?? ""} onChange={(e) => upd({ durationMin: Number(e.target.value) || undefined })} />
        </div>
        <div className="sm:col-span-4">
          <label className="label">Intensidade</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`btn w-10 ${practice.intensity === n ? "btn-primary" : ""}`} onClick={() => upd({ intensity: n as 1 })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-4">
          <label className="label">Exercícios / observações</label>
          <textarea className="input" rows={3} value={practice.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })}
            placeholder="Ex.: 3x2 transição, pick & roll defensivo, lançamento 5 spots…" />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Presenças</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          {ORDER.map((s) => <span key={s}>{ATTENDANCE_LABEL[s]}: <b className="text-fg">{count(s)}</b></span>)}
          <button className="btn" onClick={allPresent}>Restantes presentes</button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {players.map((p) => {
          const cur = status.get(p.id)?.status;
          return (
            <div key={p.id} className="card flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-panel-2 font-mono font-semibold">{p.number}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto">
                {ORDER.map((s) => (
                  <button key={s} onClick={() => set(p.id, s)}
                    className={`rounded-lg border px-1 py-2 text-xs sm:px-3 sm:text-sm ${cur === s ? STYLE[s] : "border-line text-muted hover:text-fg"}`}>
                    {ATTENDANCE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {players.length === 0 && <p className="text-muted">Adiciona jogadores no <Link className="text-brand" href="/equipa">Plantel</Link>.</p>}
      </div>

      <button className="btn btn-danger mt-8" onClick={async () => { if (await ask("Apagar este treino?", { confirmText: "Apagar", danger: true })) { await deletePractice(id); router.push("/treinos"); } }}>
        Apagar treino
      </button>
    </div>
  );
}
