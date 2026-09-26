"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, today, uid } from "@/lib/db";
import { useTeam } from "@/lib/team";

export default function PracticesPage() {
  const { team } = useTeam();
  const router = useRouter();
  const data = useLiveQuery(async () => {
    if (!team) return null;
    const [practices, attendance, players] = await Promise.all([
      db.practices.where("teamId").equals(team.id).reverse().sortBy("date"),
      db.attendance.where("teamId").equals(team.id).toArray(),
      db.players.where("teamId").equals(team.id).filter((p) => p.active).sortBy("number"),
    ]);
    return { practices, attendance, players };
  }, [team?.id]);

  if (!team || !data) return null;
  const { practices, attendance, players } = data;

  const create = async () => {
    const id = uid();
    await db.practices.add({ id, teamId: team.id, date: today(), title: `Treino #${practices.length + 1}`, durationMin: 90, createdAt: Date.now() });
    router.push(`/treinos/${id}`);
  };

  const byPractice = new Map<string, { present: number; total: number }>();
  for (const a of attendance) {
    const s = byPractice.get(a.practiceId) ?? { present: 0, total: 0 };
    s.total++;
    if (a.status === "present" || a.status === "late") s.present++;
    byPractice.set(a.practiceId, s);
  }

  const rows = players.map((p) => {
    const mine = attendance.filter((a) => a.playerId === p.id);
    const c = { present: 0, late: 0, absent: 0, excused: 0 };
    mine.forEach((a) => c[a.status]++);
    const counted = c.present + c.late + c.absent; // excused doesn't count against
    return { p, ...c, pct: counted ? Math.round(((c.present + c.late) / counted) * 100) : null };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h1 className="text-2xl font-semibold">Treinos</h1>
          <button className="btn btn-primary" onClick={create}>+ Novo treino</button>
        </div>
        <div className="card divide-y divide-line">
          {practices.map((p) => {
            const s = byPractice.get(p.id);
            return (
              <Link key={p.id} href={`/treinos/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-panel-2">
                <div>
                  <div className="font-medium">{p.title || "Treino"}</div>
                  <div className="text-xs text-muted">{new Date(p.date + "T12:00").toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" })}</div>
                </div>
                <div className="text-right text-sm tabular-nums">
                  {s ? <>{s.present}/{s.total}</> : <span className="text-muted">sem registo</span>}
                </div>
              </Link>
            );
          })}
          {practices.length === 0 && <p className="p-6 text-center text-sm text-muted">Nenhum treino registado.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Assiduidade da época</h2>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Jogador</th><th>Presente</th><th>Atrasado</th><th>Falta</th><th>Justif.</th><th>%</th></tr>
            </thead>
            <tbody>
              {rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)).map((r) => (
                <tr key={r.p.id}>
                  <td>#{r.p.number} {r.p.name}</td>
                  <td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td>{r.excused}</td>
                  <td>
                    {r.pct === null ? "–" : (
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded bg-bg">
                          <div className={`h-full ${r.pct >= 85 ? "bg-good" : r.pct >= 70 ? "bg-brand" : "bg-bad"}`} style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="w-10">{r.pct}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Atrasos contam como presença; faltas justificadas não contam para a percentagem.</p>
      </section>
    </div>
  );
}
