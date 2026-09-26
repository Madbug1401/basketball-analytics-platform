"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAccess } from "@/lib/auth";
import { useSeason } from "@/lib/season";
import { reb, type Line } from "@/lib/stats";
import { Kpi } from "@/components/Kpi";

export default function Dashboard() {
  const { team } = useTeam();
  const access = useAccess(team?.id);
  const s = useSeason(team?.id);
  const practices = useLiveQuery(() => (team ? db.practices.where("teamId").equals(team.id).count() : 0), [team?.id]);
  if (!team || !s) return null;

  const active = s.players.filter((p) => p.active);
  const gp = s.games.length;
  const leaders = (f: (l: Line) => number) =>
    active
      .map((p) => ({ p, l: s.totals.get(p.id) }))
      .filter((r) => r.l && r.l.gp)
      .map((r) => ({ p: r.p, v: f(r.l!) / r.l!.gp }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3);

  const steps = [
    { done: active.length >= 5, label: "Adicionar jogadores ao plantel", href: "/equipa" },
    { done: (practices ?? 0) > 0, label: "Registar a presença num treino", href: "/treinos" },
    { done: gp > 0, label: "Criar um jogo e registar eventos a partir do vídeo", href: "/jogos" },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{team.name} {team.category} {team.gender === "M" ? "Masculino" : "Feminino"}</h1>
        <p className="text-sm text-muted">Época {team.season}</p>
      </div>

      {access.isPlayer && (() => {
        const me = s.players.find((p) => p.id === access.playerId);
        const l = me ? s.totals.get(me.id) : undefined;
        const att = me ? s.attendancePct.get(me.id) : null;
        return (
          <Link href={me ? `/jogadores/${me.id}` : "/equipa"} className="card flex flex-wrap items-center gap-4 border-brand/60 p-4 hover:bg-panel-2">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand font-mono text-xl font-bold text-black">{me?.number ?? "?"}</span>
            <div className="flex-1">
              <div className="font-semibold">Olá{me ? `, ${me.name.split(" ")[0]}` : ""}! Vê a tua evolução →</div>
              <div className="text-sm text-muted">
                {l?.gp ? `${l.gp} jogos · ${(l.pts / l.gp).toFixed(1)} pts · ${(reb(l) / l.gp).toFixed(1)} ress. · ${(l.ast / l.gp).toFixed(1)} ast.` : "Ainda sem jogos registados."}
                {att !== null && att !== undefined ? ` · assiduidade ${att}%` : ""}
              </div>
            </div>
          </Link>
        );
      })()}

      {access.canEdit && steps.some((x) => !x.done) && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Primeiros passos</h2>
          <ol className="grid gap-1.5 text-sm">
            {steps.map((x, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${x.done ? "bg-good text-black" : "bg-panel-2 text-muted"}`}>{x.done ? "✓" : i + 1}</span>
                <Link href={x.href} className={x.done ? "text-muted line-through" : "hover:text-brand"}>{x.label}</Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Registo" value={`${s.record.w}–${s.record.l}`} sub={`${gp} jogos registados`} />
        <Kpi label="Pontos / jogo" value={gp ? (s.team.pts / gp).toFixed(1) : "–"} sub={gp ? `sofridos ${(s.opp.pts / gp).toFixed(1)}` : undefined} />
        <Kpi label="Ressaltos / jogo" value={gp ? (reb(s.team) / gp).toFixed(1) : "–"} />
        <Kpi label="Treinos" value={String(practices ?? 0)} />
        <Kpi label="Jogadores ativos" value={String(active.length)} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {([["Pontos", (l: Line) => l.pts], ["Ressaltos", (l: Line) => reb(l)], ["Assistências", (l: Line) => l.ast]] as const).map(([label, f]) => (
          <div key={label} className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted">Líderes — {label} / jogo</h3>
            {leaders(f).map((r, i) => (
              <Link key={r.p.id} href={`/jogadores/${r.p.id}`} className="flex items-center justify-between py-1 hover:text-brand">
                <span><span className="mr-2 text-muted">{i + 1}.</span>#{r.p.number} {r.p.name}</span>
                <span className="font-mono font-semibold">{r.v.toFixed(1)}</span>
              </Link>
            ))}
            {leaders(f).length === 0 && <p className="text-sm text-muted">Sem jogos registados.</p>}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h3 className="font-semibold">Últimos jogos</h3>
          <Link href="/jogos" className="text-sm text-brand">Ver todos</Link>
        </div>
        {[...s.games].reverse().slice(0, 5).map(({ game, stats }) => {
          const w = stats.us.pts > stats.opp.pts;
          return (
            <Link key={game.id} href={`/jogos/${game.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-panel-2">
              <span><span className={`mr-3 font-bold ${w ? "text-good" : "text-bad"}`}>{w ? "V" : "D"}</span>{game.home ? "vs" : "@"} {game.opponent}</span>
              <span className="font-mono">{stats.us.pts}–{stats.opp.pts}</span>
            </Link>
          );
        })}
        {gp === 0 && <p className="p-4 text-sm text-muted">Ainda sem jogos.</p>}
      </div>
    </div>
  );
}
