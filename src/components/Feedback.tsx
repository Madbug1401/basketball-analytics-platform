"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { fmtTs } from "@/lib/stats";
import type { Feedback, Game, ID, Player } from "@/lib/types";
import { youtubeId } from "./VideoPlayer";
import { ask } from "./Dialog";
import { notify } from "@/lib/push";
import { ReportCard } from "./PlayerReport";

/** Plays [start, end] of a game's video when the player can reach it (YouTube or a link). */
export function ClipPlayer({ game, start, end }: { game?: Game; start?: number; end?: number }) {
  if (!game || start === undefined) return null;
  const s = Math.max(0, Math.floor(start));
  const e = end !== undefined ? Math.ceil(end) : undefined;
  if (game.video.kind === "youtube") {
    const id = youtubeId(game.video.url);
    if (!id) return null;
    const q = new URLSearchParams({ start: String(s), playsinline: "1", rel: "0", ...(e ? { end: String(e) } : {}) });
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${id}?${q}`} title="Jogada"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
      </div>
    );
  }
  if (game.video.kind === "url") {
    return <video className="aspect-video w-full rounded-lg bg-black" controls playsInline preload="metadata" src={`${game.video.url}#t=${s}${e ? `,${e}` : ""}`} />;
  }
  return <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">O vídeo deste jogo está só no computador do treinador (ficheiro MP4) — pede-lhe para te mostrar a jogada ({fmtTs(s)}).</p>;
}

/** Compose a message (optionally with a clip) to one player. */
export function FeedbackComposer({ teamId, players, initial, onClose }: {
  teamId: ID; players: Player[];
  initial: { playerId?: ID; gameId?: ID; clipStart?: number; clipEnd?: number; eventIds?: ID[]; context?: string; text?: string };
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [playerId, setPlayerId] = useState<ID>(initial.playerId ?? players[0]?.id ?? "");
  const [text, setText] = useState(initial.text ?? "");
  const [range, setRange] = useState({ s: initial.clipStart, e: initial.clipEnd });
  const [err, setErr] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const send = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!playerId) return setErr("Escolhe o jogador.");
    if (!text.trim() && range.s === undefined) return setErr("Escreve uma mensagem.");
    const f: Feedback = {
      id: uid(), teamId, playerId, text: text.trim(), createdAt: Date.now(),
      author: profile?.fullName || "Treinador",
      ...(initial.gameId ? { gameId: initial.gameId } : {}),
      ...(range.s !== undefined ? { clipStart: Math.max(0, range.s), clipEnd: range.e } : {}),
      ...(initial.eventIds ? { eventIds: initial.eventIds } : {}),
    };
    await db.feedback.add(f);
    void notify({ teamId, players: [playerId], title: "Mensagem do treinador", body: f.text ? f.text.slice(0, 140) : "Tens uma jogada para ver.", url: `/jogadores/${playerId}#feedback`, tag: `fb-${f.id}` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Enviar feedback">
      <form className="card grid w-full max-w-md gap-3 p-5" onClick={(e) => e.stopPropagation()} onSubmit={send}>
        <h2 className="font-semibold">Enviar ao jogador</h2>
        {initial.context && <p className="rounded-md bg-panel-2 px-2 py-1.5 text-xs text-muted">{initial.context}</p>}
        <div>
          <label className="label">Jogador</label>
          <select className="input" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            {players.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
          </select>
        </div>
        {range.s !== undefined && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Jogada {fmtTs(range.s)}–{fmtTs(range.e ?? range.s)}</span>
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setRange({ ...range, s: Math.max(0, (range.s ?? 0) - 3) })}>−3s início</button>
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setRange({ ...range, e: (range.e ?? range.s ?? 0) + 3 })}>+3s fim</button>
          </div>
        )}
        <div>
          <label className="label">Mensagem</label>
          <textarea className="input" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Boa leitura! Repara que o defesa fechou do lado fraco — aqui podias ter passado ao canto." />
        </div>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1">Enviar</button>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
        <p className="text-[11px] text-muted">Só este jogador (e a equipa técnica) vê a mensagem.</p>
      </form>
    </div>
  );
}

/** Feedback list for one player. Players see theirs (and mark them seen); staff see status and can delete. */
export function FeedbackList({ player, isMe, canEdit }: { player: Player; isMe: boolean; canEdit: boolean }) {
  const data = useLiveQuery(async () => {
    const items = await db.feedback.where("playerId").equals(player.id).reverse().sortBy("createdAt");
    const [seen, games] = await Promise.all([
      db.seen.bulkGet(items.map((i) => i.id)),
      db.games.bulkGet([...new Set(items.map((i) => i.gameId).filter(Boolean) as string[])]),
    ]);
    return { items, seen: new Map(seen.filter(Boolean).map((s) => [s!.id, s!])), games: new Map(games.filter(Boolean).map((g) => [g!.id, g!])) };
  }, [player.id]);
  const [openClip, setOpenClip] = useState<ID | null>(null);

  // the player opened the page: mark what is shown as seen
  useEffect(() => {
    if (!isMe || !data) return;
    const unseen = data.items.filter((i) => !data.seen.has(i.id));
    if (!unseen.length) return;
    const t = setTimeout(() => {
      void db.seen.bulkPut(unseen.map((i) => ({ id: i.id, teamId: i.teamId, playerId: player.id, seenAt: Date.now() })));
    }, 1500);
    return () => clearTimeout(t);
  }, [isMe, data, player.id]);

  if (!data || (!data.items.length && !canEdit)) return null;

  return (
    <section id="feedback" className="scroll-mt-20">
      <h2 className="mb-2 font-semibold">{isMe ? "Mensagens do treinador" : "Feedback enviado"}</h2>
      <div className="grid gap-2">
        {data.items.map((f) => {
          const g = f.gameId ? data.games.get(f.gameId) : undefined;
          const seen = data.seen.get(f.id);
          return (
            <div key={f.id} className={`card p-3 ${isMe && !seen ? "border-brand/60" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{f.author ?? "Treinador"} · {new Date(f.createdAt).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}{g ? ` · ${g.home ? "vs" : "@"} ${g.opponent}` : ""}</span>
                {canEdit && !isMe && (
                  <span className="flex items-center gap-2">
                    <span className={seen ? "text-good" : ""}>{seen ? `visto ${new Date(seen.seenAt).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}` : "por ver"}</span>
                    <button className="tap -my-2 px-1 hover:text-bad" aria-label="Apagar mensagem"
                      onClick={async () => { if (await ask("Apagar esta mensagem?", { confirmText: "Apagar", danger: true })) await db.feedback.delete(f.id); }}>✕</button>
                  </span>
                )}
                {isMe && !seen && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-black">NOVO</span>}
              </div>
              {f.report ? <div className="mt-1.5"><ReportCard r={f.report} game={g} text={f.text} /></div> : f.text && <p className="mt-1.5 whitespace-pre-line text-sm">{f.text}</p>}
              {!f.report && f.clipStart !== undefined && g && (
                openClip === f.id
                  ? <div className="mt-2"><ClipPlayer game={g} start={f.clipStart} end={f.clipEnd} /></div>
                  : <button className="btn mt-2 py-1 text-xs" onClick={() => setOpenClip(f.id)}>▶ Ver a jogada ({fmtTs(f.clipStart)})</button>
              )}
            </div>
          );
        })}
        {data.items.length === 0 && <p className="card p-4 text-sm text-muted">Ainda sem mensagens. Envia uma a partir daqui ou de uma jogada no registo do jogo (botão ➤).</p>}
      </div>
    </section>
  );
}

/** Number of unseen messages for a player (for badges). */
export function useUnseenFeedback(playerId?: ID) {
  return useLiveQuery(async () => {
    if (!playerId) return 0;
    const ids = await db.feedback.where("playerId").equals(playerId).primaryKeys();
    if (!ids.length) return 0;
    const seen = await db.seen.bulkGet(ids as string[]);
    return seen.filter((s) => !s).length;
  }, [playerId]) ?? 0;
}
