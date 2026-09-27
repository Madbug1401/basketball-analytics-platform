"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useRouteId } from "@/lib/route";
import { useAccess } from "@/lib/auth";
import { ACTIONS, timeoutBucket, timeoutsAllowed, type ActionDef } from "@/lib/actions";
import { describe, periodLabel, pointsOf, sortEvents, walk } from "@/lib/stats";
import { t } from "@/lib/i18n";
import type { EventType, Game, GameEvent, ID, Player, Side } from "@/lib/types";
import { LineupPicker } from "@/components/LineupPicker";
import { Court } from "@/components/Court";
import { courtTime, liveAlerts } from "@/lib/rotation";
import { TagPicker, toggleTag } from "@/components/TagPicker";
import { ask, askText } from "@/components/Dialog";

/* ---------- game clock ---------- */

interface Clock { period: number; remaining: number; running: boolean; since: number | null }

const OT_SECONDS = 5 * 60;
const periodLength = (g: Game, p: number) => (p <= g.periods ? g.periodMinutes * 60 : OT_SECONDS);
/** game seconds elapsed before period p starts */
const periodOffset = (g: Game, p: number) => { let total = 0; for (let i = 1; i < p; i++) total += periodLength(g, i); return total; };
const clockKey = (gameId: string) => `bap.live.${gameId}`;
/** wall clock, kept outside components (only ever called from event handlers / timers) */
const nowMs = () => Date.now();
const fmtClock = (s: number) => {
  const c = Math.max(0, Math.ceil(s - 1e-6));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

function remainingNow(c: Clock, now: number) {
  return c.running && c.since ? Math.max(0, c.remaining - (now - c.since) / 1000) : c.remaining;
}

/** Rebuild the clock from the events (other device, cleared storage…): paused at the last event. */
function clockFromEvents(game: Game, sorted: GameEvent[]): Clock | null {
  const starts = sorted.filter((e) => e.type === "PERIOD_START");
  const last = starts[starts.length - 1];
  if (!last) return null;
  const len = periodLength(game, last.period);
  const off = periodOffset(game, last.period);
  const lastTs = sorted.filter((e) => e.period === last.period).reduce((m, e) => Math.max(m, e.videoTs), off);
  return { period: last.period, remaining: Math.max(0, len - (lastTs - off)), running: false, since: null };
}

/* ---------- page ---------- */

export function LivePage() {
  const id = useRouteId();
  const game = useLiveQuery(() => db.games.get(id), [id]);
  const players = useLiveQuery(
    async () => (game ? db.players.where("teamId").equals(game.teamId).filter((p) => p.active).sortBy("number") : []),
    [game?.teamId],
  );
  const events = useLiveQuery(() => db.events.where("gameId").equals(id).toArray(), [id]);
  const access = useAccess(game?.teamId);

  if (game === undefined || !players || !events) return null;
  if (!game) return <p className="text-muted">{t("Jogo não encontrado.")}</p>;
  if (!access.canEdit) return <p className="text-muted">{t("Só a equipa técnica pode registar jogos.")} <Link className="text-brand" href={`/jogos/${game.id}`}>{t("Ver estatísticas →")}</Link></p>;
  return <Live key={game.id} game={game} players={players} events={events} />;
}

type Follow = { kind: "assist"; shotId: ID; shooter: ID } | { kind: "rebound"; shotSide: Side } | null;

function Live({ game, players, events }: { game: Game; players: Player[]; events: GameEvent[] }) {
  const sorted = useMemo(() => sortEvents(events), [events]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const name = useCallback((pid?: ID) => { const p = pid ? byId.get(pid) : undefined; return p ? `#${p.number} ${p.name.split(" ")[0]}` : "?"; }, [byId]);

  /* clock (persisted per game on this device) */
  const [clock, setClockState] = useState<Clock | null>(() => {
    try {
      const raw = localStorage.getItem(clockKey(game.id));
      if (raw) return JSON.parse(raw) as Clock;
    } catch {}
    return clockFromEvents(game, sorted);
  });
  const setClock = useCallback((c: Clock | null) => {
    setClockState(c);
    try { if (c) localStorage.setItem(clockKey(game.id), JSON.stringify(c)); else localStorage.removeItem(clockKey(game.id)); } catch {}
  }, [game.id]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!clock?.running) return;
    const i = setInterval(() => {
      const ms = nowMs();
      setTick(ms);
      // buzzer: stop at 0:00
      if (remainingNow(clock, ms) <= 0) {
        setClock({ ...clock, remaining: 0, running: false, since: null });
        try { navigator.vibrate?.([200, 100, 200]); } catch {}
      }
    }, 200);
    return () => clearInterval(i);
  }, [clock, setClock]);

  // right after pressing start, tick may still be from before: never show more than the stored value
  const remaining = clock ? (clock.running ? Math.min(clock.remaining, remainingNow(clock, Math.max(tick, clock.since ?? 0))) : clock.remaining) : 0;
  const elapsed = () => {
    if (!clock) return 0;
    const len = periodLength(game, clock.period);
    return periodOffset(game, clock.period) + (len - remainingNow(clock, nowMs()));
  };

  // keep the screen on while the clock runs
  useEffect(() => {
    if (!clock?.running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, [clock?.running]);

  const toggleClock = () => {
    if (!clock) return;
    if (clock.running) setClock({ ...clock, remaining: remainingNow(clock, nowMs()), running: false, since: null });
    else if (clock.remaining > 0) setClock({ ...clock, running: true, since: nowMs() });
  };
  const adjust = (d: number) => {
    if (!clock) return;
    const r = Math.min(periodLength(game, clock.period), Math.max(0, remainingNow(clock, nowMs()) + d));
    setClock({ ...clock, remaining: r, since: clock.running ? nowMs() : null });
  };
  const setExact = async () => {
    if (!clock) return;
    const v = await askText(t("Tempo que falta no período (mm:ss):"), { confirmText: t("Acertar") });
    const m = v?.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return;
    const sec = Number(m[1]) * 60 + Number(m[2] ?? 0);
    setClock({ ...clock, remaining: Math.min(periodLength(game, clock.period), sec), since: clock.running ? nowMs() : null });
  };

  /* game state from the events */
  const state = useMemo(() => {
    const onCourt = walk(sorted, () => {});
    let period = 0, us = 0, opp = 0;
    let teamFouls = { us: 0, opp: 0 };
    const fouls = new Map<ID, number>();
    const pts = new Map<ID, number>();
    const timeouts = new Map<string, { us: number; opp: number }>();
    const ended = new Set<number>();
    for (const e of sorted) {
      if (e.type === "PERIOD_START") { period = e.period; if (e.period <= game.periods) teamFouls = { us: 0, opp: 0 }; } // FIBA: overtime counts as the 4th period
      if (e.type === "PERIOD_END") ended.add(e.period);
      const p = pointsOf(e);
      if (e.side === "us") us += p; else opp += p;
      if (p && e.side === "us" && e.playerId) pts.set(e.playerId, (pts.get(e.playerId) ?? 0) + p);
      if (e.type === "FOUL") {
        if (e.period === period) teamFouls[e.side]++;
        if (e.playerId) fouls.set(e.playerId, (fouls.get(e.playerId) ?? 0) + 1);
      }
      if (e.type === "TIMEOUT") {
        const k = timeoutBucket(e.period, game.periods);
        const to = timeouts.get(k) ?? { us: 0, opp: 0 };
        to[e.side]++;
        timeouts.set(k, to);
      }
    }
    return { onCourt, period, us, opp, teamFouls, fouls, pts, timeouts, periodEnded: period > 0 && ended.has(period) };
  }, [sorted, game.periods]);

  const started = state.period > 0;
  const bench = players.filter((p) => !state.onCourt.includes(p.id));

  /* rotation: minutes on court (game clock) and alerts vs the planned rotation */
  const rotation = useLiveQuery(() => db.agenda.get(game.id), [game.id])?.rotation;
  const nowTs = clock ? periodOffset(game, clock.period) + periodLength(game, clock.period) - remaining : undefined;
  const ct = courtTime(sorted, game, nowTs);
  const gameSecs = (pid: ID) => (ct.secs.get(pid) ?? []).reduce((a, b) => a + b, 0);
  const alerts = started && !state.periodEnded
    ? liveAlerts({ ct, game, period: state.period, remaining, rotation, fouls: state.fouls, bench: bench.map((p) => p.id) }).slice(0, 5)
    : [];
  const toUsed = state.timeouts.get(timeoutBucket(state.period || 1, game.periods)) ?? { us: 0, opp: 0 };
  const toMax = timeoutsAllowed(state.period || 1, game.periods);
  const finished = state.periodEnded && state.period >= game.periods && state.us !== state.opp;

  /* recording */
  const [selected, setSelected] = useState<ID | "opp" | null>(null);
  const [follow, setFollow] = useState<Follow>(null);
  const [sub, setSub] = useState<{ out?: ID; in?: ID } | null>(null);
  const [lastPlay, setLastPlay] = useState<ID | null>(null);
  const [lineup, setLineup] = useState<ID[] | null>(null);
  const [flash, setFlash] = useState("");
  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash((f) => (f === m ? "" : f)), 2200); };

  const log = async (type: EventType, side: Side, playerId?: ID, meta?: GameEvent["meta"], at?: number) => {
    const e: GameEvent = {
      id: uid(), teamId: game.teamId, gameId: game.id, side, playerId, type,
      period: Math.max(1, state.period), videoTs: at ?? elapsed(), meta, createdAt: nowMs(),
    };
    await db.events.add(e);
    return e;
  };

  const doAction = async (def: ActionDef) => {
    if (!selected) return toast(t("Toca primeiro num jogador (ou ADV)"));
    const side: Side = selected === "opp" ? "opp" : "us";
    const pid = selected === "opp" ? undefined : selected;
    const e = await log(def.type, side, pid, def.meta ? { ...def.meta } : undefined);
    toast(`${side === "opp" ? t("Adversário") : name(pid)} — ${t(def.label)}`);
    setFollow(null);
    setLastPlay(def.type === "SHOT" || def.type === "TOV" || def.type === "FOUL_DRAWN" ? e.id : null);
    if (def.type === "SHOT" && def.meta?.made && side === "us" && pid) setFollow({ kind: "assist", shotId: e.id, shooter: pid });
    else if ((def.type === "SHOT" || def.type === "FT") && !def.meta?.made) setFollow({ kind: "rebound", shotSide: side });
    if (def.type === "FOUL" && pid) {
      const n = (state.fouls.get(pid) ?? 0) + 1;
      if (n >= 5) {
        toast(t("{name} excluído (5 faltas) — escolhe quem entra", { name: name(pid) }));
        try { navigator.vibrate?.(300); } catch {}
        setSub({ out: pid });
        setSelected(null);
      } else if (n === 4) toast(t("Atenção: 4.ª falta de {name}", { name: name(pid) }));
    }
  };

  const tapCourt = async (pid: ID | "opp") => {
    if (sub) {
      if (pid === "opp") return;
      if (sub.in) { await doSub(pid, sub.in); return; }
      setSub({ out: pid });
      return;
    }
    if (follow?.kind === "assist") {
      if (pid !== "opp" && pid !== follow.shooter) {
        await log("AST", "us", pid, { linkedTo: follow.shotId });
        toast(`${name(pid)} — ${t("Assistência")}`);
        setFollow(null);
        return;
      }
      if (pid === "opp") setFollow(null);
    } else if (follow?.kind === "rebound") {
      if (pid === "opp") {
        await log("REB", "opp", undefined, { off: follow.shotSide === "opp" });
        toast(`${t("Adversário")} — ${follow.shotSide === "opp" ? t("Ressalto of.") : t("Ressalto def.")}`);
      } else {
        await log("REB", "us", pid, { off: follow.shotSide === "us" });
        toast(`${name(pid)} — ${follow.shotSide === "us" ? t("Ressalto of.") : t("Ressalto def.")}`);
      }
      setFollow(null);
      return;
    }
    setSelected(pid);
  };

  const doSub = async (outId: ID, inId: ID) => {
    await log("SUB", "us", undefined, { in: inId, out: outId });
    toast(t("Entra {in} · Sai {out}", { in: name(inId), out: name(outId) }));
    if (selected === outId) setSelected(inId);
    setSub(null);
  };
  const tapBench = (p: Player) => {
    if (sub?.out) void doSub(sub.out, p.id);
    else setSub({ in: p.id });
  };

  const timeout = async (side: Side) => {
    if (toUsed[side] >= toMax && !(await ask(side === "us" ? t("Já usámos os {n} descontos desta parte. Registar mesmo assim?", { n: toMax }) : t("O adversário já usou os {n} descontos desta parte. Registar mesmo assim?", { n: toMax })))) return;
    if (clock?.running) setClock({ ...clock, remaining: remainingNow(clock, nowMs()), running: false, since: null });
    await log("TIMEOUT", side);
    toast(`${t("Desconto de tempo")} — ${side === "us" ? t("nós") : game.opponent}`);
  };

  const undo = async () => {
    const last = [...events].filter((e) => e.type !== "PERIOD_START").sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!last) return;
    await db.events.delete(last.id);
    // undoing "Terminar período" must give the clock back (it was left at 00:00)
    if (last.type === "PERIOD_END") setClock(clockFromEvents(game, sorted.filter((e) => e.id !== last.id)));
    setFollow(null);
    setLastPlay(null);
    toast(t("Anulado: {what}", { what: describe(last, name) }));
  };

  const startPeriod = async (ids: ID[]) => {
    const next = started ? state.period + 1 : 1;
    await db.events.add({
      id: uid(), teamId: game.teamId, gameId: game.id, side: "us", type: "PERIOD_START",
      period: next, videoTs: periodOffset(game, next), meta: { lineup: ids }, createdAt: nowMs(),
    });
    setClock({ period: next, remaining: periodLength(game, next), running: false, since: null });
    setLineup(null);
    setSelected(null);
    setFollow(null);
    toast(next <= game.periods ? t("{n}.º período — carrega no relógio para começar", { n: next }) : t("Prolongamento — carrega no relógio para começar"));
  };

  const endPeriod = async () => {
    if (!clock) return;
    if (remaining > 0 && !(await ask(t("Ainda faltam {time}. Terminar o {n}.º período?", { time: fmtClock(remaining), n: state.period }), { confirmText: t("Terminar") }))) return;
    setClock({ ...clock, remaining: 0, running: false, since: null });
    await log("PERIOD_END", "us", undefined, undefined, periodOffset(game, state.period) + periodLength(game, state.period));
    setFollow(null);
    setSub(null);
  };

  const tagLast = lastPlay ? events.find((e) => e.id === lastPlay) : undefined;
  const recent = [...sorted].reverse().filter((e) => e.type !== "PERIOD_START").slice(0, 8);
  // regulation: "2.º período"; overtime: "P1 período" (1st overtime)
  const isOT = state.period > game.periods;
  const otN = state.period - game.periods;
  const periodName = isOT ? t("P{n} período", { n: otN }) : t("{n}.º período", { n: state.period || 1 });

  /* ---------- UI ---------- */

  const scoreboard = (
    <div className="card sticky top-[3.75rem] z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 shadow-lg sm:px-4">
      <div className="min-w-0 text-center">
        <div className="truncate text-[11px] font-medium text-muted">{t("NÓS")}</div>
        <div className="font-mono text-4xl font-bold tabular-nums leading-none">{state.us}</div>
        <div className={`mt-1 text-[11px] ${state.teamFouls.us >= 4 ? "font-semibold text-bad" : "text-muted"}`}>
          F {state.teamFouls.us}{state.teamFouls.us >= 4 ? ` · ${t("bónus")}` : ""} · {t("DT {n}", { n: toMax - toUsed.us })}
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] text-muted">{started ? periodName : "—"}</div>
        <button onClick={toggleClock} disabled={!clock || state.periodEnded}
          className={`mt-0.5 rounded-lg px-3 py-1 font-mono text-3xl font-bold tabular-nums sm:text-4xl ${clock?.running ? "bg-good/15 text-good" : remaining === 0 && started ? "bg-bad/15 text-bad" : "bg-panel-2"}`}
          aria-label={clock?.running ? t("Parar relógio") : t("Iniciar relógio")}>
          {fmtClock(remaining)}
        </button>
        <div className="mt-1 text-[11px] text-muted">{clock?.running ? t("a correr · toca para parar") : started && !state.periodEnded ? t("parado · toca para iniciar") : ""}</div>
      </div>
      <div className="min-w-0 text-center">
        <div className="truncate text-[11px] font-medium text-muted">{game.opponent.toUpperCase()}</div>
        <div className="font-mono text-4xl font-bold tabular-nums leading-none text-opp">{state.opp}</div>
        <div className={`mt-1 text-[11px] ${state.teamFouls.opp >= 4 ? "font-semibold text-good" : "text-muted"}`}>
          F {state.teamFouls.opp}{state.teamFouls.opp >= 4 ? ` · ${t("bónus")}` : ""} · {t("DT {n}", { n: toMax - toUsed.opp })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/jogos/${game.id}`} className="tap text-sm text-muted hover:text-fg">{t("← Estatísticas")}</Link>
          <span className="rounded-full bg-bad/15 px-2 py-0.5 text-xs font-semibold text-bad">{t("● AO VIVO")}</span>
        </div>

        {scoreboard}

        {/* before the game / between periods */}
        {!started && !lineup && (
          <div className="card p-4 text-sm">
            <p><b>{t("Modo ao vivo")}</b> — {t("para registar no banco, sem vídeo. O relógio de jogo dá os minutos exatos de cada jogador.")}</p>
            <button className="btn btn-primary mt-3 w-full" onClick={() => setLineup([])}>{t("Definir 5 inicial")}</button>
          </div>
        )}
        {lineup && (
          <LineupPicker players={players} value={lineup} onChange={setLineup} onCancel={() => setLineup(null)}
            title={started ? (state.period + 1 <= game.periods ? t("5 em campo no {n}.º período", { n: state.period + 1 }) : t("5 em campo no prolongamento")) : t("5 inicial")}
            confirmLabel={started ? t("Começar período") : t("Começar jogo")} hint="" onConfirm={() => startPeriod(lineup)} />
        )}
        {started && state.periodEnded && !lineup && (
          <div className="card border-brand/60 p-4 text-sm">
            {finished ? (
              <>
                <p className="text-base font-semibold">{t("Fim do jogo:")} {state.us}–{state.opp} {state.us > state.opp ? "🏆" : ""}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Link href={`/jogos/${game.id}`} className="btn btn-primary">{t("Ver estatísticas e partilhar")}</Link>
                  <button className="btn" onClick={() => setLineup([...state.onCourt])}>{t("Afinal há prolongamento")}</button>
                </div>
              </>
            ) : (
              <>
                <p>{isOT ? t("Fim do P{n} período", { n: otN }) : t("Fim do {n}.º período", { n: state.period || 1 })}{state.period >= game.periods && state.us === state.opp ? ` — ${t("empate, vamos a prolongamento")}` : ""}.</p>
                <button className="btn btn-primary mt-3 w-full" onClick={() => setLineup([...state.onCourt])}>
                  {state.period >= game.periods ? t("Começar prolongamento") : t("Começar {n}.º período", { n: state.period + 1 })}
                </button>
              </>
            )}
          </div>
        )}

        {started && !state.periodEnded && !lineup && (
          <>
            {/* clock tools */}
            <div className="grid grid-cols-5 gap-1.5">
              <button className="btn px-1 text-xs" onClick={() => adjust(-10)}>−10s</button>
              <button className="btn px-1 text-xs" onClick={() => adjust(-1)}>−1s</button>
              <button className="btn px-1 text-xs" onClick={setExact}>{t("Acertar")}</button>
              <button className="btn px-1 text-xs" onClick={() => adjust(1)}>+1s</button>
              <button className="btn px-1 text-xs" onClick={() => adjust(10)}>+10s</button>
            </div>

            {/* status */}
            <div className={`rounded-lg border px-3 py-2 text-sm ${follow || sub ? "border-brand bg-brand/10" : "border-line bg-panel"}`} aria-live="polite">
              {sub ? (
                sub.out ? <>{t("Sai")} <b>{name(sub.out)}</b> — {t("toca em quem entra (banco)")}</>
                  : sub.in ? <>{t("Entra")} <b>{name(sub.in)}</b> — {t("toca em quem sai (em campo)")}</>
                  : <>{t("Substituição: toca em quem sai")}</>
              ) : follow?.kind === "assist" ? (
                <>{t("Assistência? Toca no jogador")} · <button className="tap -my-2 font-medium text-brand underline" onClick={() => setFollow(null)}>{t("sem assistência")}</button></>
              ) : follow?.kind === "rebound" ? (
                <>{t("Ressalto? Toca no jogador ou em ADV")} · <button className="tap -my-2 font-medium text-brand underline" onClick={() => setFollow(null)}>{t("ignorar")}</button></>
              ) : selected ? (
                <>{t("A registar para")} <b className={selected === "opp" ? "text-opp" : "text-brand"}>{selected === "opp" ? t("Adversário") : name(selected)}</b></>
              ) : (
                <>{t("Toca num jogador e depois na ação.")}</>
              )}
              {flash && <div className="mt-0.5 text-xs text-muted">✓ {flash}</div>}
            </div>

            {alerts.length > 0 && (
              <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm" aria-live="polite">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>{t("ROTAÇÃO")}{rotation ? "" : ` · ${t("sem plano (define-o na página do jogo)")}`}</span>
                </div>
                <ul className="grid gap-1">
                  {alerts.map((a, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${a.tone === "bad" ? "bg-bad" : a.tone === "warn" ? "bg-brand" : "bg-opp"}`} aria-hidden />
                      <span><b>{name(a.playerId)}</b> <span className="text-muted">{a.text}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* on court */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>{t("EM CAMPO")}</span>
                <button className={`btn px-3 py-1 text-xs ${sub ? "btn-primary" : ""}`} onClick={() => setSub(sub ? null : {})}>{sub ? t("Cancelar troca") : t("Substituição")}</button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {[0, 1, 2, 3, 4].map((i) => {
                  const pid = state.onCourt[i];
                  const p = pid ? byId.get(pid) : undefined;
                  const f = pid ? state.fouls.get(pid) ?? 0 : 0;
                  const sel = selected === pid && !!pid;
                  const out = sub?.out === pid;
                  return (
                    <button key={i} disabled={!pid} onClick={() => pid && tapCourt(pid)}
                      className={`relative min-h-[4.5rem] rounded-xl border px-1 py-2 text-center ${out ? "border-bad bg-bad/15" : sel ? "border-brand bg-brand/15" : "border-line bg-panel active:bg-panel-2"}`}>
                      <div className="font-mono text-2xl font-bold leading-none">{p?.number ?? "–"}</div>
                      <div className="mt-1 truncate text-xs text-muted">{p?.name.split(" ")[0] ?? ""}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{pid ? `${state.pts.get(pid) ?? 0} pts · ${Math.floor(gameSecs(pid) / 60)}'` : ""}</div>
                      {f > 0 && <div className={`absolute right-1.5 top-1 text-[10px] tracking-tighter ${f >= 4 ? "text-bad" : "text-muted"}`} aria-label={t("{n} faltas", { n: f })}>{"●".repeat(Math.min(f, 5))}</div>}
                    </button>
                  );
                })}
                <button onClick={() => tapCourt("opp")}
                  className={`min-h-[4.5rem] rounded-xl border px-1 py-2 text-center ${selected === "opp" ? "border-opp bg-opp/15" : "border-line bg-panel active:bg-panel-2"}`}>
                  <div className="font-mono text-2xl font-bold leading-none text-opp">{t("ADV")}</div>
                  <div className="mt-1 truncate text-xs text-muted">{game.opponent}</div>
                </button>
              </div>
            </div>

            {/* actions */}
            <div className="grid grid-cols-4 gap-1.5">
              {ACTIONS.map((a) => (
                <button key={a.key} onClick={() => doAction(a)}
                  className={`min-h-12 rounded-xl border border-line bg-panel px-1 text-sm font-semibold active:scale-95 active:bg-panel-2 ${a.tone === "good" ? "text-good" : a.tone === "bad" ? "text-bad" : ""}`}>
                  {t(a.label)}
                </button>
              ))}
              <button onClick={undo} className="col-span-2 min-h-12 rounded-xl border border-line bg-panel px-1 text-sm text-muted active:bg-panel-2">{t("↶ Anular último")}</button>
            </div>

            {tagLast && (
              <div className="rounded-lg border border-line bg-panel px-3 py-2">
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span>{t("Contexto da jogada")} <span className="opacity-70">{t("(opcional)")}</span></span>
                  <button className="tap -my-2 px-1 hover:text-fg" onClick={() => setLastPlay(null)} aria-label={t("Fechar contexto")}>✕</button>
                </div>
                <TagPicker compact value={tagLast.meta?.tags ?? []}
                  onToggle={(tag) => db.events.update(tagLast.id, { meta: { ...(tagLast.meta ?? {}), tags: toggleTag(tagLast.meta?.tags, tag) } })} />
                {tagLast.type === "SHOT" && (
                  <div className="mt-2">
                    <div className="mb-1 text-xs text-muted">{tagLast.x === undefined ? t("Onde foi o lançamento? Toca no campo (opcional)") : t("Local marcado ✓ — toca para corrigir")}</div>
                    <div className="mx-auto max-w-[260px]">
                      <Court onPick={(x, y) => db.events.update(tagLast.id, { x, y })}
                        shots={tagLast.x !== undefined ? [{ id: tagLast.id, x: tagLast.x, y: tagLast.y!, made: !!tagLast.meta?.made, side: tagLast.side }] : []} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* bench */}
            <div>
              <div className="mb-1 text-xs text-muted">{t("BANCO")} <span className="opacity-70">— {t("toca para fazer entrar")}</span></div>
              <div className="flex flex-wrap gap-1.5">
                {bench.map((p) => {
                  const f = state.fouls.get(p.id) ?? 0;
                  return (
                    <button key={p.id} onClick={() => tapBench(p)} disabled={f >= 5}
                      className={`min-h-10 rounded-lg border px-2.5 text-sm ${sub?.in === p.id ? "border-good bg-good/15 text-good" : "border-line text-muted active:bg-panel-2"}`}>
                      <b className="font-mono text-fg">#{p.number}</b> {p.name.split(" ")[0]}
                      {(state.pts.get(p.id) || f) ? <span className="ml-1 text-[11px]">{state.pts.get(p.id) ?? 0}p{f ? ` · ${f}F` : ""}</span> : null}
                    </button>
                  );
                })}
                {bench.length === 0 && <span className="text-sm text-muted">{t("Sem suplentes.")}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <button className="btn" onClick={() => timeout("us")}>{t("Desconto nós")}</button>
              <button className="btn" onClick={() => timeout("opp")}>{t("Desconto adv.")}</button>
              <button className="btn col-span-2 border-bad/50 text-bad sm:col-span-1" onClick={endPeriod}>{t("Terminar período")}</button>
            </div>
          </>
        )}
      </div>

      {/* recent events */}
      <aside className="card lg:sticky lg:top-20">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-sm font-semibold">{t("Últimos registos")}</h2>
          <Link href={`/jogos/${game.id}/logger`} className="tap text-xs text-brand">{t("Completar com vídeo")}</Link>
        </div>
        <ul className="divide-y divide-line/50">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="w-8 shrink-0 font-mono text-xs text-muted">{periodLabel(e.period)}</span>
              <span className={`min-w-0 flex-1 truncate ${e.side === "opp" ? "text-opp" : ""}`}>
                {e.type === "SUB" || e.type === "PERIOD_END" || e.type === "TIMEOUT" ? "" : e.side === "opp" ? `${t("Adv.")} ` : `${name(e.playerId)} `}
                <span className="text-muted">{describe(e, name)}{e.type === "TIMEOUT" ? ` (${e.side === "us" ? t("nós") : t("adv.")})` : ""}</span>
              </span>
              <button className="-my-1.5 grid h-8 w-8 shrink-0 place-items-center text-muted hover:text-bad" aria-label={t("Apagar")}
                onClick={async () => { if (await ask(t("Apagar \"{what}\"?", { what: describe(e, name) }), { confirmText: t("Apagar"), danger: true })) await db.events.delete(e.id); }}>✕</button>
            </li>
          ))}
          {recent.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t("Ainda sem registos.")}</li>}
        </ul>
      </aside>
    </div>
  );
}
