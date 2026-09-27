"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAccess } from "@/lib/auth";
import { useSeason } from "@/lib/season";
import { reb, type Line } from "@/lib/stats";
import { Kpi } from "@/components/Kpi";
import { GoalCard } from "@/components/Goals";
import { AgendaCard } from "@/components/AgendaCard";
import { isUpcoming, useAgenda } from "@/lib/agenda";
import { useUnseenFeedback } from "@/components/Feedback";
import { PushPrompt } from "@/components/PushSettings";
import { WellnessCheck } from "@/components/Wellness";
import { L, t } from "@/lib/i18n";

export default function Dashboard() {
  const { team } = useTeam();
  const access = useAccess(team?.id);
  const s = useSeason(team?.id);
  const practices = useLiveQuery(() => (team ? db.practices.where("teamId").equals(team.id).count() : 0), [team?.id]);
  const agenda = useAgenda(team?.id);
  const unseen = useUnseenFeedback(access.isPlayer ? access.playerId : undefined);
  const goals = useLiveQuery(() => (team ? db.goals.where("teamId").equals(team.id).filter((g) => g.active).toArray() : []), [team?.id]);
  if (!team || !s) return null;
  const byId = new Map(s.players.map((p) => [p.id, p]));
  // players: their own goals first; staff: the team's goals
  const shownGoals = (goals ?? [])
    .filter((g) => (access.isPlayer ? g.playerId === access.playerId || !g.playerId : !g.playerId))
    .sort((a, b) => Number(!a.playerId) - Number(!b.playerId))
    .slice(0, 3);

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
    { done: active.length >= 5, label: t("Adicionar jogadores ao plantel"), href: "/equipa" },
    { done: (practices ?? 0) > 0, label: t("Registar a presença num treino"), href: "/treinos" },
    { done: gp > 0, label: t("Criar um jogo e registar eventos a partir do vídeo"), href: "/jogos" },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{team.name} {team.category} {team.gender === "M" ? t("Masculino") : t("Feminino")}</h1>
        <p className="text-sm text-muted">{t("Época {season}", { season: team.season })}</p>
      </div>

      {access.isPlayer && (() => {
        const me = s.players.find((p) => p.id === access.playerId);
        const l = me ? s.totals.get(me.id) : undefined;
        const att = me ? s.attendancePct.get(me.id) : null;
        return (
          <Link href={me ? `/jogadores/${me.id}` : "/equipa"} className="card flex flex-wrap items-center gap-4 border-brand/60 p-4 hover:bg-panel-2">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand font-mono text-xl font-bold text-black">{me?.number ?? "?"}</span>
            <div className="flex-1">
              <div className="font-semibold">{me ? t("Olá, {name}! Vê a tua evolução →", { name: me.name.split(" ")[0] }) : t("Olá! Vê a tua evolução →")}</div>
              <div className="text-sm text-muted">
                {l?.gp ? t("{gp} jogos · {pts} pts · {reb} ress. · {ast} ast.", { gp: l.gp, pts: (l.pts / l.gp).toFixed(1), reb: (reb(l) / l.gp).toFixed(1), ast: (l.ast / l.gp).toFixed(1) }) : t("Ainda sem jogos registados.")}
                {att !== null && att !== undefined ? ` · ${t("assiduidade {v}%", { v: att })}` : ""}
              </div>
            </div>
          </Link>
        );
      })()}

      <PushPrompt />

      {access.isPlayer && access.playerId && <WellnessCheck teamId={team.id} playerId={access.playerId} />}

      {access.isPlayer && unseen > 0 && (
        <Link href={`/jogadores/${access.playerId}#feedback`} className="card flex items-center gap-3 border-brand bg-brand/10 p-4 hover:bg-brand/15">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-lg text-black">✉</span>
          <span className="flex-1 font-semibold">{unseen === 1 ? t("Tens 1 mensagem nova do treinador") : t("Tens {n} mensagens novas do treinador", { n: unseen })}</span>
          <span className="text-brand">→</span>
        </Link>
      )}

      {access.canEdit && steps.some((x) => !x.done) && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">{t("Primeiros passos")}</h2>
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

      {agenda && agenda.items.some(isUpcoming) && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{t("Próximos")}</h2>
            <Link href="/agenda" className="tap text-sm text-brand">{t("Agenda")}</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {agenda.items.filter(isUpcoming).slice(0, access.isPlayer ? 3 : 2).map((it) => (
              <AgendaCard key={it.id} it={it} players={agenda.players} teamId={team.id} teamName={`${team.name} ${team.category}`}
                canEdit={false} myPlayerId={access.isPlayer ? access.playerId : undefined} compact />
            ))}
          </div>
        </section>
      )}

      {shownGoals.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{access.isPlayer ? t("Os teus objetivos") : t("Objetivos da equipa")}</h2>
            <Link href="/objetivos" className="tap text-sm text-brand">{t("Ver todos")}</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shownGoals.map((g) => <GoalCard key={g.id} goal={g} season={s} players={byId} />)}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t("Registo|vitórias")} value={`${s.record.w}–${s.record.l}`} sub={gp === 1 ? t("{n} jogo registado", { n: gp }) : t("{n} jogos registados", { n: gp })} />
        <Kpi label={t("Pontos / jogo")} value={gp ? (s.team.pts / gp).toFixed(1) : "–"} sub={gp ? t("sofridos {v}", { v: (s.opp.pts / gp).toFixed(1) }) : undefined} />
        <Kpi label={t("Ressaltos / jogo")} value={gp ? (reb(s.team) / gp).toFixed(1) : "–"} />
        <Kpi label={t("Treinos")} value={String(practices ?? 0)} />
        <Kpi label={t("Jogadores ativos")} value={String(active.length)} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {([[L("Pontos"), (l: Line) => l.pts], [L("Ressaltos"), (l: Line) => reb(l)], [L("Assistências"), (l: Line) => l.ast]] as const).map(([label, f]) => (
          <div key={label} className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted">{t("Líderes — {stat} / jogo", { stat: t(label) })}</h3>
            {leaders(f).map((r, i) => (
              <Link key={r.p.id} href={`/jogadores/${r.p.id}`} className="flex items-center justify-between py-1 hover:text-brand">
                <span><span className="mr-2 text-muted">{i + 1}.</span>#{r.p.number} {r.p.name}</span>
                <span className="font-mono font-semibold">{r.v.toFixed(1)}</span>
              </Link>
            ))}
            {leaders(f).length === 0 && <p className="text-sm text-muted">{t("Sem jogos registados.")}</p>}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h3 className="font-semibold">{t("Últimos jogos")}</h3>
          <Link href="/jogos" className="tap text-sm text-brand">{t("Ver todos")}</Link>
        </div>
        {[...s.games].reverse().slice(0, 5).map(({ game, stats }) => {
          const w = stats.us.pts > stats.opp.pts;
          return (
            <Link key={game.id} href={`/jogos/${game.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-panel-2">
              <span><span className={`mr-3 font-bold ${w ? "text-good" : "text-bad"}`}>{w ? t("V") : t("D")}</span>{game.home ? "vs" : "@"} {game.opponent}</span>
              <span className="font-mono">{stats.us.pts}–{stats.opp.pts}</span>
            </Link>
          );
        })}
        {gp === 0 && <p className="p-4 text-sm text-muted">{t("Ainda sem jogos.")}</p>}
      </div>
    </div>
  );
}
