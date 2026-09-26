"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import type { EventType, Game, GameEvent, ID, Player, Side } from "@/lib/types";
import { describe, fmtTs, pointsOf, sortEvents, walk } from "@/lib/stats";
import { isThree } from "@/lib/court";
import { Court } from "@/components/Court";
import { EventLog } from "@/components/EventLog";
import { Html5Player, StopwatchPlayer, YouTubePlayer, youtubeId, type PlayerHandle } from "@/components/VideoPlayer";

type Actor = { kind: "slot"; i: number } | { kind: "player"; id: ID } | { kind: "opp" };

interface ActionDef {
  key: string;
  label: string;
  type: EventType;
  meta?: GameEvent["meta"];
  tone?: "good" | "bad";
}

const ACTIONS: ActionDef[] = [
  { key: "q", label: "2PT ✓", type: "SHOT", meta: { pts: 2, made: true }, tone: "good" },
  { key: "w", label: "2PT ✗", type: "SHOT", meta: { pts: 2, made: false }, tone: "bad" },
  { key: "e", label: "3PT ✓", type: "SHOT", meta: { pts: 3, made: true }, tone: "good" },
  { key: "r", label: "3PT ✗", type: "SHOT", meta: { pts: 3, made: false }, tone: "bad" },
  { key: "t", label: "LL ✓", type: "FT", meta: { made: true }, tone: "good" },
  { key: "y", label: "LL ✗", type: "FT", meta: { made: false }, tone: "bad" },
  { key: "o", label: "Ress. Of", type: "REB", meta: { off: true } },
  { key: "d", label: "Ress. Def", type: "REB", meta: { off: false } },
  { key: "a", label: "Assist.", type: "AST" },
  { key: "s", label: "Roubo", type: "STL" },
  { key: "b", label: "Desarme", type: "BLK" },
  { key: "p", label: "Perda", type: "TOV" },
  { key: "f", label: "Falta", type: "FOUL" },
  { key: "g", label: "F. sofrida", type: "FOUL_DRAWN" },
];

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

type Follow =
  | { kind: "assist"; shotId: ID; shooter?: ID }
  | { kind: "rebound"; shotSide: Side }
  | null;

export default function LoggerPage() {
  const { id } = useParams<{ id: string }>();
  const game = useLiveQuery(() => db.games.get(id), [id]);
  const players = useLiveQuery(
    async () => (game ? db.players.where("teamId").equals(game.teamId).filter((p) => p.active).sortBy("number") : []),
    [game?.teamId],
  );
  const events = useLiveQuery(() => db.events.where("gameId").equals(id).toArray(), [id]);

  if (game === undefined || !players || !events) return null;
  if (!game) return <p className="text-muted">Jogo não encontrado.</p>;
  return <Logger game={game} players={players} events={events} />;
}

function Logger({ game, players, events }: { game: Game; players: Player[]; events: GameEvent[] }) {
  const video = useRef<PlayerHandle>(null);
  const [now, setNow] = useState(0);
  const [rate, setRate] = useState(1);
  const [actor, setActor] = useState<Actor>({ kind: "slot", i: 0 });
  const [pendingShot, setPendingShot] = useState<ID | null>(null); // shot waiting for a court click
  const [pendingLoc, setPendingLoc] = useState<{ x: number; y: number } | null>(null); // click waiting for a result
  const [follow, setFollow] = useState<Follow>(null);
  const [sub, setSub] = useState<{ out?: ID; in?: ID } | null>(null);
  const [lineupDraft, setLineupDraft] = useState<ID[] | null>(null);
  const [numBuf, setNumBuf] = useState("");
  const [flash, setFlash] = useState<string>("");
  const [help, setHelp] = useState(false);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const name = useCallback((pid?: ID) => { const p = pid ? byId.get(pid) : undefined; return p ? `#${p.number} ${p.name}` : "?"; }, [byId]);

  // poll the video clock
  useEffect(() => {
    const i = setInterval(() => setNow(video.current?.getTime() ?? 0), 200);
    return () => clearInterval(i);
  }, []);

  const sorted = useMemo(() => sortEvents(events), [events]);

  // state of the game at the current video time
  const state = useMemo(() => {
    const upto = sorted.filter((e) => e.videoTs <= now + 0.05);
    let period = 0;
    let us = 0, opp = 0, teamFouls = { us: 0, opp: 0 };
    const fouls = new Map<ID, number>();
    const onCourt = walk(upto, () => {});
    for (const e of upto) {
      if (e.type === "PERIOD_START") { period = e.period; teamFouls = { us: 0, opp: 0 }; }
      const pts = pointsOf(e);
      if (e.side === "us") us += pts; else opp += pts;
      if (e.type === "FOUL") {
        teamFouls[e.side]++;
        if (e.playerId) fouls.set(e.playerId, (fouls.get(e.playerId) ?? 0) + 1);
      }
    }
    return { period, onCourt, us, opp, fouls, teamFouls };
  }, [sorted, now]);

  const periodNow = Math.max(1, state.period);
  const started = state.period > 0;
  const bench = players.filter((p) => !state.onCourt.includes(p.id));

  const actorPlayer = (a: Actor = actor): ID | undefined =>
    a.kind === "slot" ? state.onCourt[a.i] : a.kind === "player" ? a.id : undefined;
  const actorSide = (a: Actor = actor): Side => (a.kind === "opp" ? "opp" : "us");

  const toast = (msg: string) => { setFlash(msg); setTimeout(() => setFlash((f) => (f === msg ? "" : f)), 1500); };

  const log = useCallback(
    async (type: EventType, side: Side, playerId: ID | undefined, meta?: GameEvent["meta"], loc?: { x: number; y: number }) => {
      const e: GameEvent = {
        id: uid(), teamId: game.teamId, gameId: game.id, side, playerId, type,
        period: periodNow, videoTs: video.current?.getTime() ?? now, meta, createdAt: Date.now(),
        ...(loc ? { x: loc.x, y: loc.y } : {}),
      };
      await db.events.add(e);
      return e;
    },
    [game.teamId, game.id, periodNow, now],
  );

  const doAction = async (def: ActionDef, a: Actor = actor) => {
    const side = actorSide(a);
    const pid = actorPlayer(a);
    if (side === "us" && !pid) return toast("Escolhe um jogador (1–5)");
    let meta = def.meta ? { ...def.meta } : undefined;
    let loc: { x: number; y: number } | undefined;
    if (def.type === "SHOT" && pendingLoc) {
      loc = pendingLoc;
      setPendingLoc(null);
    }
    const e = await log(def.type, side, pid, meta, loc);
    toast(`${side === "opp" ? "Adversário" : name(pid)} — ${def.label}`);
    setFollow(null);
    if (def.type === "SHOT") {
      if (!loc) setPendingShot(e.id);
      if (meta?.made && side === "us") setFollow({ kind: "assist", shotId: e.id, shooter: pid });
      else if (!meta?.made) setFollow({ kind: "rebound", shotSide: side });
    } else if (def.type === "FT" && !meta?.made) {
      setFollow({ kind: "rebound", shotSide: side });
    }
    meta = undefined;
  };

  const courtClick = async (x: number, y: number) => {
    if (pendingShot) {
      const three = isThree(x, y);
      const shot = events.find((e) => e.id === pendingShot);
      await db.events.update(pendingShot, { x, y });
      if (shot && (shot.meta?.pts === 3) !== three) toast(`Local marcado (atenção: clique ${three ? "fora" : "dentro"} da linha de 3)`);
      else toast("Local do lançamento marcado");
      setPendingShot(null);
      return;
    }
    setPendingLoc({ x, y });
  };

  const resolveLoc = async (made: boolean) => {
    if (!pendingLoc) return;
    const pts = isThree(pendingLoc.x, pendingLoc.y) ? 3 : 2;
    const def = ACTIONS.find((d) => d.type === "SHOT" && d.meta?.pts === pts && d.meta?.made === made)!;
    await doAction(def);
  };

  const handleFollow = async (slot: number | "opp"): Promise<boolean> => {
    if (!follow) return false;
    if (follow.kind === "assist") {
      if (slot === "opp") { setFollow(null); return false; }
      const pid = state.onCourt[slot];
      if (!pid || pid === follow.shooter) return false;
      await log("AST", "us", pid, { linkedTo: follow.shotId });
      toast(`${name(pid)} — Assistência`);
      setFollow(null);
      return true;
    }
    // rebound
    if (slot === "opp") {
      await log("REB", "opp", undefined, { off: follow.shotSide === "opp" });
      toast(`Adversário — Ressalto ${follow.shotSide === "opp" ? "Of" : "Def"}`);
    } else {
      const pid = state.onCourt[slot];
      if (!pid) return false;
      await log("REB", "us", pid, { off: follow.shotSide === "us" });
      toast(`${name(pid)} — Ressalto ${follow.shotSide === "us" ? "Of" : "Def"}`);
    }
    setFollow(null);
    return true;
  };

  const doSub = async (outId: ID, inId: ID) => {
    await log("SUB", "us", undefined, { in: inId, out: outId });
    toast(`Entra ${name(inId)} · Sai ${name(outId)}`);
    setSub(null);
    setNumBuf("");
  };

  const clickOnCourt = (i: number) => {
    const pid = state.onCourt[i];
    if (sub) {
      if (sub.in) doSub(pid, sub.in);
      else setSub({ out: pid });
      return;
    }
    setActor({ kind: "slot", i });
  };

  const clickBench = (p: Player) => {
    if (!started) return;
    if (sub?.out) doSub(sub.out, p.id);
    else setSub({ in: p.id });
  };

  const startPeriod = async (lineup: ID[]) => {
    const next = started ? state.period + 1 : 1;
    await db.events.add({
      id: uid(), teamId: game.teamId, gameId: game.id, side: "us", type: "PERIOD_START",
      period: next, videoTs: video.current?.getTime() ?? now, meta: { lineup }, createdAt: Date.now(),
    });
    setLineupDraft(null);
    toast(`Início do ${next}.º período`);
  };

  const undo = async () => {
    const last = [...events].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!last) return;
    await db.events.delete(last.id);
    setPendingShot(null);
    setFollow(null);
    toast(`Anulado: ${describe(last, name)}`);
  };

  // keyboard
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKey = async (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    const v = video.current;

    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); return undo(); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (k === " ") { e.preventDefault(); v?.toggle(); return; }
    if (k === "arrowleft" || k === "arrowright") {
      e.preventDefault();
      const d = (e.shiftKey ? 1 : 5) * (k === "arrowleft" ? -1 : 1);
      v?.nudge(d);
      return;
    }
    if (k === "," || k === ".") {
      const i = RATES.indexOf(rate);
      const r = RATES[Math.min(RATES.length - 1, Math.max(0, (i < 0 ? 2 : i) + (k === "." ? 1 : -1)))];
      v?.setRate(r); setRate(r); toast(`Velocidade ${r}x`);
      return;
    }
    if (k === "?" ) { setHelp((h) => !h); return; }
    if (k === "escape") { setFollow(null); setPendingShot(null); setPendingLoc(null); setSub(null); setNumBuf(""); setHelp(false); return; }

    if (!started) return;

    // substitution: jersey number typing
    if (sub && /^[0-9]$/.test(k) && (sub.out || sub.in)) {
      setNumBuf((b) => (b + k).slice(-2));
      return;
    }
    if (sub && k === "enter" && numBuf) {
      const p = players.find((pl) => String(pl.number) === numBuf);
      if (!p) { toast(`Nº ${numBuf} não encontrado`); setNumBuf(""); return; }
      if (sub.out && !state.onCourt.includes(p.id)) return doSub(sub.out, p.id);
      if (sub.in && state.onCourt.includes(p.id)) return doSub(p.id, sub.in);
      toast("Número inválido para esta troca"); setNumBuf("");
      return;
    }
    if (sub && /^[1-5]$/.test(k) && !sub.out && !sub.in) { setSub({ out: state.onCourt[Number(k) - 1] }); return; }

    if (/^[1-5]$/.test(k)) {
      const slot = Number(k) - 1;
      if (await handleFollow(slot)) return;
      setActor({ kind: "slot", i: slot });
      return;
    }
    if (k === "0" || k === "`" || k === "'") {
      if (await handleFollow("opp")) return;
      setActor({ kind: "opp" });
      return;
    }
    if (k === "u") { setSub({}); return; }
    if (k === "enter" && pendingLoc) return resolveLoc(true);
    if (k === "backspace" && pendingLoc) { e.preventDefault(); return resolveLoc(false); }

    const def = ACTIONS.find((a) => a.key === k);
    if (def) { e.preventDefault(); return doAction(def); }
  };
  useEffect(() => { handler.current = onKey; });
  useEffect(() => {
    const h = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const shots = events.filter((e) => e.type === "SHOT" && e.x !== undefined).map((e) => ({
    id: e.id, x: e.x!, y: e.y!, made: !!e.meta?.made, side: e.side, highlight: Math.abs(e.videoTs - now) < 3,
  }));

  const firstStart = sorted.find((e) => e.type === "PERIOD_START");
  const lastEvent = sorted[sorted.length - 1];
  const seekTo = (t: number) => video.current?.seek(t);

  const actorLabel = actor.kind === "opp" ? "Adversário" : name(actorPlayer());

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
      {/* LEFT: video + log */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Link href={`/jogos/${game.id}`} className="text-sm text-muted hover:text-fg">← Estatísticas do jogo</Link>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Vídeo {fmtTs(now)} · {rate}x</span>
            <button className="btn py-1 text-xs" onClick={() => setHelp(true)}>Atalhos <span className="kbd">?</span></button>
          </div>
        </div>
        <VideoArea game={game} playerRef={video} />
        <EventLog events={sorted} players={players} now={now} name={name} video={video} />
      </div>

      {/* RIGHT: control pad */}
      <div className="grid h-fit gap-3 xl:sticky xl:top-[4.25rem] xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto xl:pr-1">
        <div className="card flex items-center justify-between px-4 py-3">
          <div className="text-center">
            <div className="text-xs text-muted">NÓS</div>
            <div className="font-mono text-3xl font-bold tabular-nums">{state.us}</div>
            <div className={`text-[10px] ${state.teamFouls.us >= 4 ? "font-semibold text-bad" : "text-muted"}`}>faltas {state.teamFouls.us}{state.teamFouls.us >= 4 ? " · bónus adv." : ""}</div>
          </div>
          <div className="text-center">
            <div className="rounded bg-panel-2 px-2 py-0.5 font-mono text-sm">{started ? `P${periodNow}` : "—"}</div>
            <button className="btn mt-2 px-2 py-1 text-xs" onClick={() => setLineupDraft(started ? [...state.onCourt] : [])}>
              {started ? "Próx. período" : "Definir 5 inicial"}
            </button>
          </div>
          <div className="text-center">
            <div className="max-w-28 truncate text-xs text-muted">{game.opponent.toUpperCase()}</div>
            <div className="font-mono text-3xl font-bold tabular-nums text-opp">{state.opp}</div>
            <div className={`text-[10px] ${state.teamFouls.opp >= 4 ? "font-semibold text-good" : "text-muted"}`}>faltas {state.teamFouls.opp}{state.teamFouls.opp >= 4 ? " · bónus nosso" : ""}</div>
          </div>
        </div>

        {!started && !lineupDraft && (firstStart && lastEvent ? (
            <div className="card border-brand/50 p-4 text-sm">
              Este jogo já tem <b>{sorted.length} eventos</b>. O vídeo está antes do início ({fmtTs(firstStart.videoTs)}).
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => seekTo(firstStart.videoTs)}>Ir para o início</button>
                <button className="btn btn-primary" onClick={() => seekTo(lastEvent.videoTs + 1)}>Continuar ({fmtTs(lastEvent.videoTs)})</button>
              </div>
            </div>
          ) : (
            <div className="card border-brand/50 p-4 text-sm">
              <b>Passo 1:</b> avança o vídeo até ao salto inicial e define o 5 inicial.
              <button className="btn btn-primary mt-3 w-full" onClick={() => setLineupDraft([])}>Definir 5 inicial</button>
            </div>
          ))}

        {lineupDraft && (
          <LineupPicker players={players} value={lineupDraft} onChange={setLineupDraft}
            title={started ? `5 em campo no início do ${state.period + 1}.º período` : "5 inicial"}
            onConfirm={() => startPeriod(lineupDraft)} onCancel={() => setLineupDraft(null)} />
        )}

        {started && !lineupDraft && (
          <>
            {/* status banner */}
            <div className={`rounded-lg border px-3 py-2 text-sm ${follow || pendingShot || sub || pendingLoc ? "border-brand bg-brand/10" : "border-line bg-panel"}`}>
              {sub ? (
                sub.out ? <>Troca: sai <b>{name(sub.out)}</b> — escolhe quem entra (clica ou escreve o nº + Enter) {numBuf && <span className="kbd">{numBuf}</span>}</>
                  : sub.in ? <>Troca: entra <b>{name(sub.in)}</b> — escolhe quem sai (clica)</>
                  : <>Troca: escolhe quem sai (<span className="kbd">1</span>–<span className="kbd">5</span> ou clica)</>
              ) : pendingLoc ? (
                <>Local marcado — <span className="kbd">Enter</span> convertido · <span className="kbd">⌫</span> falhado · ou tecla de lançamento</>
              ) : follow?.kind === "assist" ? (
                <>Assistência? <span className="kbd">1</span>–<span className="kbd">5</span> · <span className="kbd">Esc</span> sem assist.{pendingShot && " · clica no campo para o local"}</>
              ) : follow?.kind === "rebound" ? (
                <>Ressalto? <span className="kbd">1</span>–<span className="kbd">5</span> nós · <span className="kbd">0</span> adv.{pendingShot && " · clica no campo para o local"}</>
              ) : pendingShot ? (
                <>Clica no campo onde foi o lançamento (<span className="kbd">Esc</span> para saltar)</>
              ) : (
                <>A registar para: <b className={actor.kind === "opp" ? "text-opp" : "text-brand"}>{actorLabel}</b></>
              )}
              {flash && <div className="mt-1 text-xs text-muted">✓ {flash}</div>}
            </div>

            {/* on court */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>EM CAMPO</span>
                <button className={`btn px-2 py-0.5 text-xs ${sub ? "btn-primary" : ""}`} onClick={() => setSub(sub ? null : {})}>
                  Substituição <span className="kbd">U</span>
                </button>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => {
                  const pid = state.onCourt[i];
                  const p = pid ? byId.get(pid) : undefined;
                  const sel = actor.kind === "slot" && actor.i === i;
                  const out = sub?.out === pid;
                  const f = pid ? state.fouls.get(pid) ?? 0 : 0;
                  return (
                    <button key={i} onClick={() => clickOnCourt(i)}
                      className={`relative rounded-lg border px-1 py-2 text-center ${out ? "border-bad bg-bad/15" : sel ? "border-brand bg-brand/15" : "border-line bg-panel hover:border-muted"}`}>
                      <span className="kbd absolute left-1 top-1">{i + 1}</span>
                      <div className="font-mono text-xl font-bold">{p?.number ?? "–"}</div>
                      <div className="truncate text-[11px] text-muted">{p?.name.split(" ")[0] ?? ""}</div>
                      {f > 0 && <div className={`absolute right-1 top-1 text-[10px] ${f >= 4 ? "text-bad" : "text-muted"}`}>{"●".repeat(Math.min(f, 5))}</div>}
                    </button>
                  );
                })}
                <button onClick={() => setActor({ kind: "opp" })}
                  className={`relative rounded-lg border px-1 py-2 text-center ${actor.kind === "opp" ? "border-opp bg-opp/15" : "border-line bg-panel hover:border-muted"}`}>
                  <span className="kbd absolute left-1 top-1">0</span>
                  <div className="font-mono text-xl font-bold text-opp">ADV</div>
                  <div className="truncate text-[11px] text-muted">equipa</div>
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {bench.map((p) => (
                  <button key={p.id} onClick={() => clickBench(p)}
                    className={`rounded-md border px-2 py-1 text-xs ${sub?.in === p.id ? "border-good bg-good/15" : "border-line text-muted hover:text-fg"}`}
                    title="Clica para fazer entrar">
                    #{p.number} {p.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* court */}
            <div className="card p-2">
              <Court shots={shots} onPick={courtClick} pending={pendingLoc} className="mx-auto max-w-[340px]" />
              {pendingLoc && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="btn border-good text-good" onClick={() => resolveLoc(true)}>✓ Convertido</button>
                  <button className="btn border-bad text-bad" onClick={() => resolveLoc(false)}>✗ Falhado</button>
                </div>
              )}
              <p className="mt-1 px-1 text-[11px] text-muted">
                Clica no campo e depois escolhe o resultado — 2 ou 3 pontos é detetado pela posição. Ou carrega na tecla e clica o local a seguir.
              </p>
            </div>
            {/* actions */}
            <div className="grid grid-cols-4 gap-1.5">
              {ACTIONS.map((a) => (
                <button key={a.key} onClick={() => doAction(a)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border border-line bg-panel px-1 py-1.5 text-sm font-medium hover:border-muted active:scale-95 ${a.tone === "good" ? "text-good" : a.tone === "bad" ? "text-bad" : ""}`}>
                  <span className="whitespace-nowrap">{a.label}</span>
                  <span className="kbd uppercase">{a.key}</span>
                </button>
              ))}
              <button onClick={undo} className="col-span-2 rounded-lg border border-line bg-panel px-1 py-2.5 text-sm text-muted hover:border-muted">
                Anular último <span className="kbd">Ctrl Z</span>
              </button>
            </div>

          </>
        )}
      </div>

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ---------------- sub components ---------------- */

function VideoArea({ game, playerRef }: { game: Game; playerRef: React.Ref<PlayerHandle> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const handle = useLiveQuery(() => db.videoHandles.get(game.id), [game.id]);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  if (game.video.kind === "youtube") {
    const vid = youtubeId(game.video.url);
    return vid ? <YouTubePlayer ref={playerRef} videoId={vid} /> : <p className="text-bad">Link do YouTube inválido.</p>;
  }
  if (game.video.kind === "url") return <Html5Player ref={playerRef} src={game.video.url} />;
  if (game.video.kind === "none") return <StopwatchPlayer ref={playerRef} />;

  // local file
  if (src) return <><Html5Player ref={playerRef} src={src} /><p className="mt-1 text-xs text-muted">{fileName}</p></>;

  const loadFile = async (file: File) => {
    setSrc(URL.createObjectURL(file));
    setFileName(file.name);
    await db.games.update(game.id, { video: { kind: "file", fileName: file.name } });
  };

  const pick = async () => {
    const w = window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> };
    if (w.showOpenFilePicker) {
      try {
        const [h] = await w.showOpenFilePicker({ types: [{ description: "Vídeo", accept: { "video/*": [".mp4", ".mov", ".webm", ".mkv"] } }] });
        await db.videoHandles.put({ gameId: game.id, handle: h });
        await loadFile(await h.getFile());
      } catch { /* cancelled */ }
    } else {
      document.getElementById("file-fallback")?.click();
    }
  };

  const reopen = async () => {
    if (!handle) return;
    const h = handle.handle as FileSystemFileHandle & { requestPermission?: (o: unknown) => Promise<string> };
    try {
      if (h.requestPermission && (await h.requestPermission({ mode: "read" })) !== "granted") return;
      await loadFile(await h.getFile());
    } catch { pick(); }
  };

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-panel p-6 text-center">
      <p className="text-muted">Escolhe o ficheiro de vídeo do jogo (fica só no teu computador).</p>
      <div className="flex gap-2">
        {handle && <button className="btn btn-primary" onClick={reopen}>Reabrir {game.video.kind === "file" ? game.video.fileName : "vídeo"}</button>}
        <button className={`btn ${handle ? "" : "btn-primary"}`} onClick={pick}>Escolher MP4…</button>
      </div>
      <input id="file-fallback" type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
    </div>
  );
}

function LineupPicker({ players, value, onChange, onConfirm, onCancel, title }: {
  players: Player[]; value: ID[]; onChange: (v: ID[]) => void; onConfirm: () => void; onCancel: () => void; title: string;
}) {
  const toggle = (id: ID) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length < 5 ? [...value, id] : value);
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className={`text-sm ${value.length === 5 ? "text-good" : "text-muted"}`}>{value.length}/5</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {players.map((p) => {
          const i = value.indexOf(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)}
              className={`relative rounded-lg border px-2 py-2 text-left text-sm ${i >= 0 ? "border-brand bg-brand/15" : "border-line hover:border-muted"}`}>
              {i >= 0 && <span className="kbd absolute right-1 top-1">{i + 1}</span>}
              <b className="font-mono">#{p.number}</b> {p.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      {players.length === 0 && <p className="text-sm text-muted">Sem jogadores ativos — adiciona-os no <Link className="text-brand" href="/equipa">Plantel</Link>.</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary flex-1" disabled={value.length !== 5} onClick={onConfirm}>Confirmar neste momento do vídeo</button>
        <button className="btn" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="mt-2 text-[11px] text-muted">A ordem escolhida define as teclas 1–5.</p>
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["1 – 5", "Escolher jogador em campo (ou assistência / ressalto logo após um lançamento)"],
    ["0", "Adversário"],
    ["Q / W", "2 pontos convertido / falhado"],
    ["E / R", "3 pontos convertido / falhado"],
    ["T / Y", "Lance livre convertido / falhado"],
    ["O / D", "Ressalto ofensivo / defensivo"],
    ["A S B P", "Assistência · Roubo · Desarme · Perda de bola"],
    ["F / G", "Falta / Falta sofrida"],
    ["U", "Substituição (depois 1–5 para quem sai e o nº de quem entra + Enter)"],
    ["Clique no campo", "Marca o local; Enter = convertido, ⌫ = falhado"],
    ["Espaço", "Play / pausa"],
    ["← / →", "Recuar / avançar 5 s (Shift = 1 s)"],
    [", / .", "Mais lento / mais rápido"],
    ["Ctrl + Z", "Anular último evento"],
    ["Esc", "Cancelar o que está pendente"],
    ["✎ na lista", "Editar um evento (jogador, tipo, resultado, tempo)"],
    ["Ver sequência", "Filtra a lista (ex.: perdas do #7) e vê as jogadas seguidas"],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">Atalhos de teclado</h3>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, d]) => (
              <tr key={k} className="border-b border-line/50">
                <td className="whitespace-nowrap py-1.5 pr-4 font-mono text-brand">{k}</td>
                <td className="py-1.5 text-muted">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Fluxo típico: <b>2</b> (jogador) → <b>Q</b> (2PT ✓) → <b>4</b> (assistência) → clique no campo. Falhado: <b>W</b> → <b>3</b> (ressalto).</p>
        <button className="btn mt-4 w-full" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
