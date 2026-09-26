"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { db } from "@/lib/db";
import { PLAY_TAGS, TAG_LABEL, type EventType, type GameEvent, type ID, type Player, type PlayTag } from "@/lib/types";
import { describe, EVENT_LABEL, fmtTs } from "@/lib/stats";
import type { PlayerHandle } from "./VideoPlayer";
import { ask } from "./Dialog";
import { TagPicker, toggleTag } from "./TagPicker";

export const CLIP_BEFORE = 6; // segundos antes do evento
export const CLIP_AFTER = 2; // segundos depois

type TypeFilter = "all" | "SHOT_MADE" | "SHOT_MISS" | EventType;

const TYPE_OPTIONS: [TypeFilter, string][] = [
  ["all", "Todos os tipos"],
  ["SHOT", "Lançamentos"],
  ["SHOT_MADE", "Lançamentos convertidos"],
  ["SHOT_MISS", "Lançamentos falhados"],
  ["FT", "Lances livres"],
  ["REB", "Ressaltos"],
  ["AST", "Assistências"],
  ["STL", "Roubos"],
  ["BLK", "Desarmes"],
  ["TOV", "Perdas de bola"],
  ["FOUL", "Faltas"],
  ["FOUL_DRAWN", "Faltas sofridas"],
  ["SUB", "Substituições"],
  ["TIMEOUT", "Descontos de tempo"],
];

export interface LogFilter { side: "all" | "us" | "opp"; player: ID | "all"; type: TypeFilter; tag: PlayTag | "all" }

export function readFilterFromUrl(): Partial<LogFilter> & { autoplay?: boolean } {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const out: Partial<LogFilter> & { autoplay?: boolean } = {};
  const side = q.get("lado");
  if (side === "us" || side === "opp") out.side = side;
  if (q.get("jogador")) out.player = q.get("jogador")!;
  if (q.get("tipo")) out.type = q.get("tipo") as TypeFilter;
  const tag = q.get("contexto");
  if (tag && PLAY_TAGS.some((t) => t.id === tag)) out.tag = tag as PlayTag;
  if (q.get("play") === "1") out.autoplay = true;
  return out;
}

function matches(e: GameEvent, f: LogFilter) {
  if (e.type === "PERIOD_START" || e.type === "PERIOD_END") return f.type === "all" && f.player === "all" && f.tag === "all";
  if (f.tag !== "all" && !e.meta?.tags?.includes(f.tag)) return false;
  if (f.side !== "all" && e.side !== f.side) return false;
  if (f.player !== "all" && e.playerId !== f.player && e.meta?.in !== f.player && e.meta?.out !== f.player) return false;
  if (f.type === "all") return true;
  if (f.type === "SHOT_MADE") return e.type === "SHOT" && !!e.meta?.made;
  if (f.type === "SHOT_MISS") return e.type === "SHOT" && !e.meta?.made;
  return e.type === f.type;
}

export function EventLog({
  events, players, now, name, video, readOnly = false,
}: {
  events: GameEvent[];
  players: Player[];
  now: number;
  name: (id?: ID) => string;
  video: RefObject<PlayerHandle | null>;
  readOnly?: boolean;
}) {
  const [init] = useState(readFilterFromUrl);
  const [f, setF] = useState<LogFilter>({ side: init.side ?? "all", player: init.player ?? "all", type: init.type ?? "all", tag: init.tag ?? "all" });
  const [editing, setEditing] = useState<ID | null>(null);
  const [clip, setClip] = useState<number | null>(null); // index in playlist while playing
  const autoplayed = useRef(false);

  const list = useMemo(() => events.filter((e) => matches(e, f)), [events, f]);
  const playlist = useMemo(() => list.filter((e) => e.type !== "PERIOD_START" && e.type !== "PERIOD_END"), [list]);
  const shown = [...list].reverse();

  const playAt = (i: number) => {
    const e = playlist[i];
    if (!e) { setClip(null); video.current?.pause(); return; }
    setClip(i);
    video.current?.seek(e.videoTs - CLIP_BEFORE);
    video.current?.play();
  };

  // advance the playlist when the current clip ends
  useEffect(() => {
    if (clip === null) return;
    const e = playlist[clip];
    if (!e) return;
    if (now > e.videoTs + CLIP_AFTER) {
      const t = setTimeout(() => playAt(clip + 1), 0);
      return () => clearTimeout(t);
    }
  });

  // ?play=1 in the URL starts the playlist once the video is ready
  useEffect(() => {
    if (!init.autoplay || autoplayed.current || !playlist.length) return;
    const t = setTimeout(() => { autoplayed.current = true; playAt(0); }, 1500);
    return () => clearTimeout(t);
  });

  const filtered = f.side !== "all" || f.player !== "all" || f.type !== "all" || f.tag !== "all";

  return (
    <div className="card mt-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h3 className="mr-auto text-sm font-semibold">Eventos ({filtered ? `${playlist.length} de ${events.filter((e) => e.type !== "PERIOD_START").length}` : events.length})</h3>
        <div className="flex gap-1">
          {(["all", "us", "opp"] as const).map((s) => (
            <button key={s} onClick={() => setF({ ...f, side: s })} className={`rounded px-2 py-0.5 text-xs pointer-coarse:px-3 pointer-coarse:py-1.5 ${f.side === s ? "bg-panel-2" : "text-muted"}`}>
              {s === "all" ? "Todos" : s === "us" ? "Nós" : "Adv."}
            </button>
          ))}
        </div>
        <select className="input w-auto py-1 text-xs" value={f.player} onChange={(e) => setF({ ...f, player: e.target.value })} aria-label="Filtrar jogador">
          <option value="all">Todos os jogadores</option>
          {players.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
        </select>
        <select className="input w-auto py-1 text-xs" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as TypeFilter })} aria-label="Filtrar tipo">
          {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input w-auto py-1 text-xs" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value as LogFilter["tag"] })} aria-label="Filtrar contexto">
          <option value="all">Todos os contextos</option>
          {PLAY_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {clip === null ? (
          <button className="btn btn-primary py-1 text-xs" disabled={!playlist.length} onClick={() => playAt(0)} title="Vê todas as jogadas filtradas seguidas">
            ▶ Ver sequência ({playlist.length})
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button className="btn py-1 text-xs" onClick={() => playAt(Math.max(0, clip - 1))}>⏮</button>
            <span className="px-1 font-mono text-xs">{clip + 1}/{playlist.length}</span>
            <button className="btn py-1 text-xs" onClick={() => playAt(clip + 1)}>⏭</button>
            <button className="btn py-1 text-xs" onClick={() => { setClip(null); video.current?.pause(); }}>■ Parar</button>
          </div>
        )}
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        {shown.map((e) => {
          const past = e.videoTs <= now + 0.05;
          const playing = clip !== null && playlist[clip]?.id === e.id;
          return (
            <div key={e.id}>
              <div className={`group flex items-center gap-2 sm:gap-3 border-b border-line/40 px-3 py-1.5 text-sm ${past ? "" : "opacity-45"} ${e.type === "PERIOD_START" ? "bg-panel-2/60" : ""} ${playing ? "bg-brand/15 opacity-100!" : ""}`}>
                <button onClick={() => { setClip(null); video.current?.seek(e.videoTs - 4); video.current?.play(); }} className="-my-1.5 w-[4.75rem] shrink-0 whitespace-nowrap py-2 text-left font-mono text-xs text-brand hover:underline" title="Ver jogada">
                  ▶ {fmtTs(e.videoTs)}
                </button>
                <span className="w-6 shrink-0 font-mono text-xs text-muted">P{e.period}</span>
                <span className={`w-24 shrink-0 truncate sm:w-36 ${e.side === "opp" ? "text-opp" : ""}`}>
                  {e.type === "SUB" || e.type === "PERIOD_START" ? "" : e.side === "opp" ? "Adversário" : name(e.playerId)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {describe(e, name)}{e.type === "SHOT" && e.x === undefined ? " · sem local" : ""}
                  {e.meta?.tags?.map((t) => <span key={t} className="ml-1.5 rounded-full border border-brand/40 px-1.5 text-[10px] text-brand">{TAG_LABEL[t]}</span>)}
                </span>
                {!readOnly && <><button onClick={() => setEditing(editing === e.id ? null : e.id)} className={`${editing === e.id ? "visible text-brand" : "invisible pointer-coarse:visible"} -my-1.5 grid h-8 w-7 shrink-0 place-items-center text-muted hover:text-fg group-hover:visible`} title="Editar" aria-label="Editar">✎</button>
                <button onClick={async () => { if (!matchMedia("(pointer: coarse)").matches || await ask("Apagar este evento?", { confirmText: "Apagar", danger: true })) void db.events.delete(e.id); }} className="invisible -my-1.5 grid h-8 w-7 shrink-0 place-items-center text-muted hover:text-bad group-hover:visible pointer-coarse:visible" title="Apagar" aria-label="Apagar">✕</button></>}
              </div>
              {editing === e.id && <EventEditor e={e} players={players} now={now} onClose={() => setEditing(null)} />}
            </div>
          );
        })}
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">{filtered ? "Nenhum evento com estes filtros." : "Ainda sem eventos."}</p>}
      </div>
    </div>
  );
}

const EDITABLE_TYPES: EventType[] = ["SHOT", "FT", "REB", "AST", "STL", "BLK", "TOV", "FOUL", "FOUL_DRAWN"];

function EventEditor({ e, players, now, onClose }: { e: GameEvent; players: Player[]; now: number; onClose: () => void }) {
  const upd = (patch: Partial<GameEvent>) => db.events.update(e.id, patch);
  const meta = (patch: GameEvent["meta"]) => upd({ meta: { ...(e.meta ?? {}), ...patch } });
  const seg = "rounded-md border px-2 py-1 text-xs";
  const on = "border-brand bg-brand/15 text-brand";
  const off = "border-line text-muted hover:text-fg";

  if (e.type === "PERIOD_START" || e.type === "PERIOD_END") {
    return (
      <div className="border-b border-line bg-bg/60 px-3 py-2 text-xs text-muted">
        <TimeRow e={e} now={now} upd={upd} />
        {e.type === "PERIOD_START" && <p className="mt-2">Para mudar o 5 do período, apaga este evento e define-o de novo no painel.</p>}
        <button className="btn mt-2 py-1 text-xs" onClick={onClose}>Fechar</button>
      </div>
    );
  }

  return (
    <div className="grid gap-2 border-b border-line bg-bg/60 px-3 py-2 text-xs">
      {e.type === "TIMEOUT" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Desconto pedido por</span>
          <button className={`${seg} ${e.side === "us" ? on : off}`} onClick={() => upd({ side: "us" })}>Nós</button>
          <button className={`${seg} ${e.side === "opp" ? "border-opp bg-opp/15 text-opp" : off}`} onClick={() => upd({ side: "opp" })}>Adversário</button>
        </div>
      ) : e.type === "SUB" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Entra</span>
          <select className="input w-auto py-1 text-xs" value={e.meta?.in} onChange={(ev) => meta({ in: ev.target.value })}>
            {players.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
          </select>
          <span className="text-muted">Sai</span>
          <select className="input w-auto py-1 text-xs" value={e.meta?.out} onChange={(ev) => meta({ out: ev.target.value })}>
            {players.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button className={`${seg} ${e.side === "us" ? on : off}`} onClick={() => upd({ side: "us", playerId: e.playerId ?? players[0]?.id })}>Nós</button>
          <button className={`${seg} ${e.side === "opp" ? "border-opp bg-opp/15 text-opp" : off}`} onClick={() => upd({ side: "opp", playerId: undefined })}>Adversário</button>
          {e.side === "us" && (
            <select className="input w-auto py-1 text-xs" value={e.playerId} onChange={(ev) => upd({ playerId: ev.target.value })}>
              {players.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
            </select>
          )}
          <select className="input w-auto py-1 text-xs" value={e.type} onChange={(ev) => {
            const type = ev.target.value as EventType;
            const m: GameEvent["meta"] = type === "SHOT" ? { pts: e.meta?.pts ?? 2, made: e.meta?.made ?? true } : type === "FT" ? { made: e.meta?.made ?? true } : type === "REB" ? { off: e.meta?.off ?? false } : {};
            upd({ type, meta: m });
          }}>
            {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
          </select>
          {e.type === "SHOT" && (
            <>
              <button className={`${seg} ${e.meta?.pts !== 3 ? on : off}`} onClick={() => meta({ pts: 2 })}>2PT</button>
              <button className={`${seg} ${e.meta?.pts === 3 ? on : off}`} onClick={() => meta({ pts: 3 })}>3PT</button>
            </>
          )}
          {(e.type === "SHOT" || e.type === "FT") && (
            <>
              <button className={`${seg} ${e.meta?.made ? "border-good bg-good/15 text-good" : off}`} onClick={() => meta({ made: true })}>✓ Convertido</button>
              <button className={`${seg} ${!e.meta?.made ? "border-bad bg-bad/15 text-bad" : off}`} onClick={() => meta({ made: false })}>✗ Falhado</button>
            </>
          )}
          {e.type === "REB" && (
            <>
              <button className={`${seg} ${e.meta?.off ? on : off}`} onClick={() => meta({ off: true })}>Ofensivo</button>
              <button className={`${seg} ${!e.meta?.off ? on : off}`} onClick={() => meta({ off: false })}>Defensivo</button>
            </>
          )}
          {e.type === "SHOT" && e.x !== undefined && (
            <button className={`${seg} ${off}`} onClick={() => upd({ x: undefined, y: undefined })}>Limpar local</button>
          )}
        </div>
      )}
      {e.type !== "SUB" && e.type !== "TIMEOUT" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Contexto</span>
          <TagPicker compact value={e.meta?.tags ?? []} onToggle={(t) => meta({ tags: toggleTag(e.meta?.tags, t) })} />
        </div>
      )}
      <TimeRow e={e} now={now} upd={upd} />
      <div><button className="btn py-1 text-xs" onClick={onClose}>Feito</button></div>
    </div>
  );
}

function TimeRow({ e, now, upd }: { e: GameEvent; now: number; upd: (p: Partial<GameEvent>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted">Tempo</span>
      <button className="btn px-2 py-0.5 text-xs" onClick={() => upd({ videoTs: Math.max(0, e.videoTs - 1) })}>−1s</button>
      <span className="font-mono">{fmtTs(e.videoTs)}</span>
      <button className="btn px-2 py-0.5 text-xs" onClick={() => upd({ videoTs: e.videoTs + 1 })}>+1s</button>
      <button className="btn px-2 py-0.5 text-xs" onClick={() => upd({ videoTs: now })}>Usar tempo atual ({fmtTs(now)})</button>
      <span className="ml-2 text-muted">Período</span>
      {[1, 2, 3, 4, 5].map((p) => (
        <button key={p} className={`rounded border px-1.5 py-0.5 ${e.period === p ? "border-brand text-brand" : "border-line text-muted"}`} onClick={() => upd({ period: p })}>
          {p <= 4 ? p : "P"}
        </button>
      ))}
    </div>
  );
}
