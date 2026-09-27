"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { useSeason } from "@/lib/season";
import { buildReport, suggestText } from "@/lib/report";
import { notify } from "@/lib/push";
import type { Game, GameEvent, ID, Player, PlayerReport, ReportClip } from "@/lib/types";
import { ClipPlayer } from "./Feedback";
import { t } from "@/lib/i18n";

const arrow = (v: number, avg: number | undefined, lowerBetter = false, tol = 1) => {
  if (avg === undefined) return null;
  const d = v - avg;
  if (Math.abs(d) < tol) return null;
  const good = lowerBetter ? d < 0 : d > 0;
  return <span className={`ml-0.5 text-[10px] ${good ? "text-good" : "text-bad"}`} aria-label={good ? t("acima da média") : t("abaixo da média")}>{d > 0 ? "▲" : "▼"}</span>;
};

/** The report as the player sees it. */
export function ReportCard({ r, game, text }: { r: PlayerReport; game?: Game; text?: string }) {
  const [open, setOpen] = useState<ReportClip | null>(null);
  const a = r.avg;
  const win = r.score[0] > r.score[1];
  const chips: [string, React.ReactNode][] = [
    ["PTS", <>{r.line.pts}{arrow(r.line.pts, a?.pts, false, 2)}</>],
    [t("RES"), <>{r.line.reb}{arrow(r.line.reb, a?.reb)}</>],
    ["AST", <>{r.line.ast}{arrow(r.line.ast, a?.ast)}</>],
    [t("ROU"), r.line.stl],
    [t("PB"), <>{r.line.tov}{arrow(r.line.tov, a?.tov, true)}</>],
    [t("LC"), `${r.line.fgm}/${r.line.fga}`],
    ["3P", `${r.line.p3m}/${r.line.p3a}`],
    [t("LL"), `${r.line.ftm}/${r.line.fta}`],
    ["MIN", r.line.min || "–"],
    ["+/-", `${r.line.pm > 0 ? "+" : ""}${r.line.pm}`],
    [t("EF"), <>{r.line.eff}{arrow(r.line.eff, a?.eff, false, 2)}</>],
  ];
  const max = Math.max(1, ...(r.trend ?? []).map((v) => Math.abs(v)));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">{t("Relatório do jogo {game}", { game: `${r.home ? "vs" : "@"} ${r.opponent}` })}</div>
        <div className={`font-mono text-sm ${win ? "text-good" : "text-bad"}`}>{win ? t("V") : t("D")} {r.score[0]}–{r.score[1]}</div>
      </div>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
        {chips.map(([k, v]) => (
          <div key={k} className="rounded-md bg-panel-2 px-1 py-1 text-center">
            <div className="font-mono text-base font-semibold leading-tight">{v}</div>
            <div className="text-[10px] text-muted">{k}</div>
          </div>
        ))}
      </div>
      {a && <p className="text-[11px] text-muted">{t("▲▼ comparado com a tua média ({pts} pts, {reb} ress., {ast} ast. em {n} jogos).", { pts: a.pts.toFixed(1), reb: a.reb.toFixed(1), ast: a.ast.toFixed(1), n: a.games })}</p>}
      {r.trend && r.trend.length > 1 && (
        <div className="flex items-end gap-1" aria-label={t("Eficiência nos últimos jogos")}>
          <span className="mr-1 text-[10px] text-muted">{t("Eficiência:")}</span>
          {r.trend.map((v, i) => (
            <span key={i} title={String(v)} className={`w-4 rounded-sm ${i === r.trend!.length - 1 ? "bg-brand" : "bg-muted/40"}`} style={{ height: `${6 + (Math.max(0, v) / max) * 22}px` }} />
          ))}
        </div>
      )}
      {text && <p className="whitespace-pre-line text-sm">{text}</p>}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {r.good && <button className={`btn justify-start py-1.5 text-left text-xs ${open === r.good ? "btn-primary" : ""}`} onClick={() => setOpen(open === r.good ? null : r.good!)}>{t("👍 Para repetir: {play}", { play: r.good.label })}</button>}
        {r.improve && <button className={`btn justify-start py-1.5 text-left text-xs ${open === r.improve ? "btn-primary" : ""}`} onClick={() => setOpen(open === r.improve ? null : r.improve!)}>{t("🔧 Para melhorar: {play}", { play: r.improve.label })}</button>}
      </div>
      {open && game && <ClipPlayer game={game} start={open.start} end={open.end} />}
      {r.goal && (
        <div className="rounded-md border border-line px-2 py-1.5 text-xs">
          <div className="flex justify-between gap-2"><span className="font-medium">🎯 {r.goal.title}</span><span className="text-muted">{r.goal.value}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-brand" style={{ width: `${Math.round(r.goal.progress * 100)}%` }} /></div>
        </div>
      )}
    </div>
  );
}

/** Staff: prepare and send the individual reports of one game. */
export function PlayerReports({ game, events, players }: { game: Game; events: GameEvent[]; players: Player[] }) {
  const season = useSeason(game.teamId);
  const { profile } = useAuth();
  const goals = useLiveQuery(() => db.goals.where("teamId").equals(game.teamId).filter((g) => g.active && !!g.playerId).toArray(), [game.teamId]);
  const sent = useLiveQuery(async () => new Set((await db.feedback.where("gameId").equals(game.id).filter((f) => !!f.report).toArray()).map((f) => f.playerId)), [game.id]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ID | null>(null);
  const [texts, setTexts] = useState<Record<ID, string>>({});
  const [skip, setSkip] = useState<Set<ID>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const reports = useMemo(() => {
    if (!goals) return [];
    return players
      .map((p) => ({ p, r: buildReport(game, events, season, p.id, goals, p.name.split(" ")[0]) }))
      .filter((x): x is { p: Player; r: PlayerReport } => !!x.r)
      .sort((a, b) => a.p.number - b.p.number);
  }, [game, events, season, players, goals]);
  if (!reports.length || !sent) return null;

  const pending = reports.filter(({ p }) => !sent.has(p.id) && !skip.has(p.id));
  const textOf = (p: Player, r: PlayerReport) => texts[p.id] ?? suggestText(r, p.name.split(" ")[0]);
  const send = async () => {
    setBusy(true);
    const now = new Date().getTime();
    for (const { p, r } of pending) {
      const text = textOf(p, r).trim();
      await db.feedback.add({
        id: uid(), teamId: game.teamId, playerId: p.id, gameId: game.id, text, report: r,
        author: profile?.fullName || t("Treinador"), createdAt: now,
        ...(r.good ? { clipStart: r.good.start, clipEnd: r.good.end } : {}),
      });
    }
    for (const { p } of pending) {
      await notify({ teamId: game.teamId, players: [p.id], title: t("O teu relatório — {game}", { game: `${game.home ? "vs" : "@"} ${game.opponent}` }), body: t("Os teus números, 2 jogadas para ver e o teu objetivo."), url: `/jogadores/${p.id}#feedback`, tag: `report-${game.id}` });
    }
    setDone(pending.length === 1 ? t("Enviado a {n} jogador.", { n: pending.length }) : t("Enviado a {n} jogadores.", { n: pending.length }));
    setBusy(false);
  };

  return (
    <section className="card overflow-hidden">
      <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <span className="font-semibold">{t("Relatórios individuais")}</span>
          <span className="block text-xs text-muted">{sent.size ? t("{n} de {total} enviados", { n: sent.size, total: reports.length }) : t("{n} jogadores — números, 2 jogadas e objetivo de cada um", { n: reports.length })}</span>
        </span>
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-line">
          <ul className="divide-y divide-line/60">
            {reports.map(({ p, r }) => {
              const isSent = sent.has(p.id);
              return (
                <li key={p.id} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    {!isSent && (
                      <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={!skip.has(p.id)} aria-label={t("Incluir {name}", { name: p.name })}
                        onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate"><b className="font-mono">#{p.number}</b> {p.name}</span>
                      <span className="block font-mono text-xs text-muted">{t("{pts} pts · {reb} ress · {ast} ast · EF {eff}", { pts: r.line.pts, reb: r.line.reb, ast: r.line.ast, eff: r.line.eff })}</span>
                    </span>
                    {isSent ? <span className="text-xs text-good">{t("enviado ✓")}</span>
                      : <button className="btn px-2 py-0.5 text-xs" onClick={() => setEdit(edit === p.id ? null : p.id)}>{edit === p.id ? t("Fechar") : t("Ver / editar")}</button>}
                  </div>
                  {edit === p.id && !isSent && (
                    <div className="mt-2 grid gap-2 rounded-lg border border-line p-2">
                      <label className="label" htmlFor={`rt-${p.id}`}>{t("Mensagem para {name}", { name: p.name.split(" ")[0] })}</label>
                      <textarea id={`rt-${p.id}`} className="input" rows={2} value={textOf(p, r)} onChange={(e) => setTexts({ ...texts, [p.id]: e.target.value })} />
                      <ReportCard r={r} game={game} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            <button className="btn btn-primary" disabled={busy || !pending.length} onClick={send}>
              {pending.length ? (pending.length === 1 ? t("Enviar a {n} jogador", { n: pending.length }) : t("Enviar a {n} jogadores", { n: pending.length })) : t("Todos enviados")}
            </button>
            {done && <span className="text-sm text-good">{done}</span>}
            <span className="text-[11px] text-muted">{t("Cada jogador só vê o seu, em “Mensagens do treinador”.")}</span>
          </div>
        </div>
      )}
    </section>
  );
}
