"use client";

import Link from "next/link";
import { useMemo } from "react";
import { possessions } from "@/lib/possessions";
import { reviewItems } from "@/lib/review";
import { fmtTs } from "@/lib/stats";
import type { Game, GameEvent, Player } from "@/lib/types";

/** "O que rever": the few moments of the game worth watching again, each a video window. */
export function ReviewList({ game, events, players }: { game: Game; events: GameEvent[]; players: Player[] }) {
  const items = useMemo(() => reviewItems(possessions(events), events, players, game.periods), [events, players, game.periods]);
  if (!items.length) return null;
  const pl = (p: number) => (p <= game.periods ? `${p}.º` : `P${p - game.periods}`);
  const total = items.reduce((a, i) => a + (i.to - i.from), 0);
  return (
    <section className="card overflow-hidden print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">O que rever</h2>
          <p className="text-xs text-muted">{items.length} momentos · cerca de {Math.max(1, Math.round(total / 60))} min de vídeo em vez do jogo todo.</p>
        </div>
      </div>
      <ol className="divide-y divide-line/60">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${it.tone === "good" ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug">{it.title}</div>
              <div className="text-xs text-muted">{pl(it.period)} período · vídeo {fmtTs(it.from)} · {it.detail}</div>
            </div>
            <Link href={`/jogos/${game.id}/logger?${new URLSearchParams({ janela: `${Math.floor(it.from)}-${Math.ceil(it.to)}`, play: "1" })}`}
              className="btn shrink-0 px-3 py-1.5 text-xs" aria-label={`Ver: ${it.title}`}>▶ {Math.max(1, Math.round((it.to - it.from) / 60 * 10) / 10)}′</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
