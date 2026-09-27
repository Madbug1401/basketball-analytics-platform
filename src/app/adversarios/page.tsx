"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useAccess } from "@/lib/auth";
import { scoutReport } from "@/lib/scouting";
import { renderScoutCard, scoutText } from "@/lib/scoutCard";
import { ImageShareDialog } from "@/components/ShareDialog";
import type { Game, Scouting, Team } from "@/lib/types";
import { useTeam } from "@/lib/team";
import { useSeason, type SeasonData } from "@/lib/season";
import { addLines, emptyLine, fmtPct, possessions, reb } from "@/lib/stats";
import { ShotQuality } from "@/components/ShotQuality";
import { zoneModel, type ZoneModel } from "@/lib/shotQuality";
import { Kpi } from "@/components/Kpi";
import { locale, t } from "@/lib/i18n";

export default function Page() {
  return <Suspense fallback={null}><OpponentsPage /></Suspense>;
}

function OpponentsPage() {
  const { team } = useTeam();
  const s = useSeason(team?.id);
  const extra = useLiveQuery(async () => (team ? {
    games: await db.games.where("teamId").equals(team.id).toArray(),
    scouting: await db.scouting.where("teamId").equals(team.id).toArray(),
  } : null), [team?.id]);
  const params = useSearchParams();
  const [picked, setSel] = useState<string | null>(null);
  const sel = picked ?? params.get("nome");
  if (!team || !s || !extra) return null;
  const todayStr = new Date().toISOString().slice(0, 10);

  const byOpp = new Map<string, typeof s.games>();
  s.games.forEach((g) => {
    const k = g.game.opponent.trim();
    byOpp.set(k, [...(byOpp.get(k) ?? []), g]);
  });
  const opponents = [...byOpp.entries()].map(([name, games]) => {
    const w = games.filter((g) => g.stats.us.pts > g.stats.opp.pts).length;
    const pf = games.reduce((a, g) => a + g.stats.us.pts, 0) / games.length;
    const pa = games.reduce((a, g) => a + g.stats.opp.pts, 0) / games.length;
    return { name, games, w, l: games.length - w, pf, pa };
  });
  // opponents we haven't played yet (upcoming games) or only have notes about
  const known = new Set(opponents.map((o) => o.name.toLowerCase()));
  for (const n of [...extra.games.map((g) => g.opponent.trim()), ...extra.scouting.map((x) => x.name.trim())]) {
    if (n && !known.has(n.toLowerCase())) { known.add(n.toLowerCase()); opponents.push({ name: n, games: [], w: 0, l: 0, pf: 0, pa: 0 }); }
  }
  opponents.sort((a, b) => a.name.localeCompare(b.name));
  const nextGame = (name: string) => extra.games.filter((g) => g.opponent.trim().toLowerCase() === name.toLowerCase() && g.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];

  const current = opponents.find((o) => o.name.toLowerCase() === sel?.toLowerCase()) ?? opponents[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{t("Adversários")}</h1>
        <div className="card divide-y divide-line">
          {opponents.map((o) => (
            <button key={o.name} onClick={() => setSel(o.name)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-panel-2 ${current?.name === o.name ? "bg-panel-2" : ""}`}>
              <div className="min-w-0">
                <div className="truncate font-medium">{o.name}</div>
                <div className="text-xs text-muted">
                  {o.games.length ? `${o.games.length > 1 ? t("{n} jogos", { n: o.games.length }) : t("{n} jogo", { n: o.games.length })} · ${t("{pf}–{pa} em média", { pf: o.pf.toFixed(0), pa: o.pa.toFixed(0) })}` : t("ainda sem jogos registados")}
                  {nextGame(o.name) ? ` · ${t("próximo {date}", { date: new Date(nextGame(o.name)!.date + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short" }) })}` : ""}
                </div>
              </div>
              {o.games.length > 0 && <span className={`font-mono text-sm ${o.w > o.l ? "text-good" : o.w < o.l ? "text-bad" : "text-muted"}`}>{o.w}–{o.l}</span>}
            </button>
          ))}
          {opponents.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("Ainda sem adversários. Cria um jogo (ou marca-o na Agenda).")}</p>}
        </div>
      </section>

      {current && (
        <div className="grid h-fit min-w-0 gap-4">
          <ScoutPanel key={current.name} name={current.name} team={team} season={s} games={extra.games}
            notes={extra.scouting.find((x) => x.name.trim().toLowerCase() === current.name.toLowerCase())} />
          {current.games.length > 0 && <OpponentDetail o={current} model={zoneModel(s.games.flatMap((g) => g.events))} />}
        </div>
      )}
    </div>
  );
}

function OpponentDetail({ o, model }: { o: { name: string; games: SeasonData["games"]; w: number; l: number; pf: number; pa: number }; model: ZoneModel }) {
  const their = o.games.reduce((acc, g) => addLines(acc, { ...g.stats.opp }), emptyLine());
  const ours = o.games.reduce((acc, g) => addLines(acc, { ...g.stats.us }), emptyLine());
  const n = o.games.length;
  const avg = (v: number) => (v / n).toFixed(1);
  const shots = o.games.flatMap((g) => g.events).filter((e) => e.side === "opp" && e.type === "SHOT");
  const byPeriod = [0, 1, 2, 3].map((i) => ({
    us: o.games.reduce((a, g) => a + (g.stats.byPeriod[i]?.us ?? 0), 0) / n,
    opp: o.games.reduce((a, g) => a + (g.stats.byPeriod[i]?.opp ?? 0), 0) / n,
  }));
  const threeShare = their.fga ? Math.round((their.p3a / their.fga) * 100) : 0;

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">{o.name}</h2>
        <p className="text-sm text-muted">{t("Tudo o que sabemos deles a partir dos nossos jogos.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t("Nosso registo")} value={`${o.w}–${o.l}`} />
        <Kpi label={t("Pontos deles / jogo")} value={avg(their.pts)} sub={t("nós {v}", { v: avg(ours.pts) })} />
        <Kpi label={t("LC % deles")} value={fmtPct(their.fgm, their.fga)} sub={`3P ${fmtPct(their.p3m, their.p3a)}`} />
        <Kpi label={t("Ressaltos of. deles")} value={avg(their.oreb)} sub={t("total {v}", { v: avg(reb(their)) })} />
        <Kpi label={t("Perdas deles / jogo")} value={avg(their.tov)} sub={t("posses {v}", { v: avg(possessions(their)) })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="card p-3">
          <h3 className="mb-2 font-semibold">{t("Onde lançam")}</h3>
          <ShotQuality shots={shots} model={model} opp />
        </div>
        <div className="grid h-fit gap-4">
          <div className="card overflow-x-auto">
            <div className="border-b border-line px-3 py-2"><h3 className="font-semibold">{t("Média por período")}</h3></div>
            <table className="tbl">
              <thead><tr><th></th>{[1, 2, 3, 4].map((p) => <th key={p}>{t("{p}º", { p })}</th>)}</tr></thead>
              <tbody>
                <tr><td>{t("Nós")}</td>{byPeriod.map((p, i) => <td key={i}>{p.us.toFixed(1)}</td>)}</tr>
                <tr><td className="text-opp">{o.name}</td>{byPeriod.map((p, i) => <td key={i} className={p.opp > p.us ? "text-bad" : ""}>{p.opp.toFixed(1)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold">{t("Notas rápidas")}</h3>
            <ul className="grid gap-1 text-muted">
              <li>• {t("{share}% dos lançamentos deles são triplos ({pct}).", { share: threeShare, pct: fmtPct(their.p3m, their.p3a) })}</li>
              <li>• {t("Lances livres: {pct} em {n} tentativas por jogo.", { pct: fmtPct(their.ftm, their.fta), n: avg(their.fta) })}</li>
              <li>• {t("Nós perdemos {us} bolas por jogo contra eles; eles {them}.", { us: avg(ours.tov), them: avg(their.tov) })}</li>
              <li>• {t("Ressaltos: {us} nós vs {them} eles.", { us: avg(reb(ours)), them: avg(reb(their)) })}</li>
            </ul>
          </div>
          <div className="card divide-y divide-line">
            {o.games.map((g) => (
              <Link key={g.game.id} href={`/jogos/${g.game.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-panel-2">
                <span>{g.game.home ? "vs" : "@"} {o.name} <span className="text-muted">· {g.game.date}</span></span>
                <span className={`font-mono ${g.stats.us.pts > g.stats.opp.pts ? "text-good" : "text-bad"}`}>{g.stats.us.pts}–{g.stats.opp.pts}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">{t("Os eventos do adversário são registados a nível de equipa (sem jogadores individuais).")}</p>
    </section>
  );
}

function ScoutPanel({ name, team, season, games, notes }: { name: string; team: Team; season: SeasonData; games: Game[]; notes?: Scouting }) {
  const access = useAccess(team.id);
  const [f, setF] = useState({ notes: notes?.notes ?? "", keyPlayers: notes?.keyPlayers ?? "" });
  const [rowId] = useState(() => notes?.id ?? uid());
  const [open, setOpen] = useState(false);
  const report = scoutReport(name, season, games, { id: rowId, teamId: team.id, name, notes: f.notes.trim() || undefined, keyPlayers: f.keyPlayers.trim() || undefined, editedAt: 0 });
  const nextInfo = useLiveQuery(() => (report.next ? db.agenda.get(report.next.id) : undefined), [report.next?.id]);
  const save = async () => {
    const row: Scouting = { id: notes?.id ?? rowId, teamId: team.id, name, notes: f.notes.trim() || undefined, keyPlayers: f.keyPlayers.trim() || undefined, editedAt: Date.now() };
    await db.scouting.put(row);
  };
  return (
    <section className="card grid gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{name}</h2>
          <p className="text-sm text-muted">
            {report.next ? `${t("Próximo jogo: {date}", { date: new Date(report.next.date + "T12:00").toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" }) })}${nextInfo?.time ? ` · ${nextInfo.time}` : ""}` : t("Sem jogo marcado contra eles.")}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>{t("Relatório pré-jogo")}</button>
      </div>
      {report.keys.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-brand">{t("Chaves do jogo")}</h3>
          <ul className="grid gap-1 text-sm">{report.keys.map((k) => <li key={k} className="flex gap-2"><span className="text-brand">•</span><span>{k}</span></li>)}</ul>
        </div>
      )}
      {access.canEdit ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="label">{t("Jogadores a vigiar")}</label>
            <textarea className="input" rows={3} placeholder={t("Ex.: #10 base rápido, só vai para a direita · #7 lança bem dos cantos")} value={f.keyPlayers} onChange={(e) => setF({ ...f, keyPlayers: e.target.value })} onBlur={save} /></div>
          <div><label className="label">{t("Notas do treinador")}</label>
            <textarea className="input" rows={3} placeholder={t("Defendem à zona 2-3 · pressionam depois de cesto · o treinador pede muitos descontos")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} onBlur={save} /></div>
        </div>
      ) : (notes?.keyPlayers || notes?.notes) ? (
        <div className="grid gap-2 text-sm">
          {notes?.keyPlayers && <p><b>{t("A vigiar:")}</b> <span className="text-muted">{notes.keyPlayers}</span></p>}
          {notes?.notes && <p className="whitespace-pre-line text-muted">{notes.notes}</p>}
        </div>
      ) : null}
      {open && (
        <ImageShareDialog title={t("Relatório pré-jogo")} onClose={() => setOpen(false)}
          render={() => renderScoutCard(report, team, nextInfo)} renderKey={`${name}-${f.notes}-${f.keyPlayers}-${report.n}`}
          text={scoutText(report, team)} fileName={`scouting-${name}.png`.replace(/[^\w.-]+/g, "_")}
          footnote={t("Para uso interno da equipa.")} />
      )}
    </section>
  );
}
