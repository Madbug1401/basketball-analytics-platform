"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { describe, fmtTs, pointsOf, sortEvents } from "@/lib/stats";
import type { ReviewItem } from "@/lib/review";
import type { Game, GameEvent, ID, Player, VideoNote } from "@/lib/types";
import { t } from "@/lib/i18n";

const W = 1000;

/** Visual timeline: one row per period with baskets, turnovers, subs and notes, plus the score margin. */
export function GameTimeline({ game, events, players, notes = [], review = [] }: {
  game: Game; events: GameEvent[]; players: Player[]; notes?: VideoNote[]; review?: ReviewItem[];
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const name = (id?: ID) => { const p = id ? byId.get(id) : undefined; return p ? `#${p.number} ${p.name.split(" ")[0]}` : "?"; };

  const data = useMemo(() => {
    const sorted = sortEvents(events);
    const spans = new Map<number, { start: number; end: number }>();
    for (const e of sorted) {
      const sp = spans.get(e.period);
      if (!sp) spans.set(e.period, { start: e.videoTs, end: e.videoTs });
      else sp.end = Math.max(sp.end, e.videoTs);
      if (e.type === "PERIOD_START") spans.get(e.period)!.start = e.videoTs;
    }
    const periods = [...spans.entries()].sort((a, b) => a[0] - b[0]);
    // score margin over the whole game (x = share of each period)
    let us = 0, opp = 0;
    const margin: { x: number; m: number }[] = [{ x: 0, m: 0 }];
    const xOf = (e: { period: number; videoTs: number }) => {
      const i = periods.findIndex(([p]) => p === e.period);
      const sp = periods[i]?.[1];
      if (!sp) return 0;
      const f = sp.end > sp.start ? (e.videoTs - sp.start) / (sp.end - sp.start) : 0;
      return ((i + Math.max(0, Math.min(1, f))) / periods.length) * W;
    };
    let maxAbs = 5;
    for (const e of sorted) {
      const p = pointsOf(e);
      if (!p) continue;
      if (e.side === "us") us += p; else opp += p;
      margin.push({ x: xOf(e), m: us - opp });
      maxAbs = Math.max(maxAbs, Math.abs(us - opp));
    }
    margin.push({ x: W, m: us - opp });
    return { sorted, periods, margin, maxAbs, xOf };
  }, [events]);

  if (!data.periods.length) return null;
  const go = (ts: number) => router.push(`/jogos/${game.id}/logger?${new URLSearchParams({ janela: `${Math.max(0, Math.floor(ts - 6))}-${Math.ceil(ts + 3)}`, play: "1" })}`);
  const pl = (p: number) => (p <= game.periods ? t("{n}.º", { n: p }) : t("Pr{n}", { n: p - game.periods }));
  const H = 90, mid = H / 2;
  const my = (m: number) => mid - (m / data.maxAbs) * (mid - 6);
  const path = data.margin.map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(1)},${my(pt.m).toFixed(1)}`).join(" ");

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">{t("Timeline do jogo")}</h2>
          <p className="text-xs text-muted">{t("Toca num momento para o ver no vídeo.")}</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span><span className="text-good">●</span> {t("cesto nosso")}</span>
          <span><span className="text-opp">●</span> {t("cesto deles")}</span>
          <span><span className="text-bad">■</span> {t("perda")}</span>
          <span><span className="text-brand">▼</span> {t("nota")}</span>
        </div>
      </div>

      {/* score margin */}
      <div className="px-3 pt-3">
        <div className="mb-1 flex justify-between text-[11px] text-muted"><span>{t("Diferença no marcador")}</span><span>{t("máx. ±{n}", { n: data.maxAbs })}</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={t("Diferença no marcador ao longo do jogo")}>
          {data.periods.map((_, i) => i > 0 && <line key={i} x1={(i / data.periods.length) * W} x2={(i / data.periods.length) * W} y1={0} y2={H} stroke="var(--color-line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--color-muted)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
          <clipPath id="above"><rect x={0} y={0} width={W} height={mid} /></clipPath>
          <clipPath id="below"><rect x={0} y={mid} width={W} height={mid} /></clipPath>
          <path d={`${path} L${W},${mid} L0,${mid} Z`} fill="var(--color-good)" fillOpacity={0.18} clipPath="url(#above)" />
          <path d={`${path} L${W},${mid} L0,${mid} Z`} fill="var(--color-bad)" fillOpacity={0.18} clipPath="url(#below)" />
          <path d={path} fill="none" stroke="var(--color-fg)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex text-[10px] text-muted">{data.periods.map(([p]) => <span key={p} className="flex-1 text-center">{pl(p)}</span>)}</div>
      </div>

      {/* one row per period */}
      <div className="grid gap-1 px-3 py-3">
        {data.periods.map(([p, sp]) => {
          const x = (ts: number) => (sp.end > sp.start ? ((ts - sp.start) / (sp.end - sp.start)) * W : 0);
          const evs = data.sorted.filter((e) => e.period === p);
          const nts = notes.filter((n) => n.period === p);
          const rv = review.filter((r) => r.period === p);
          const pct = (ts: number) => `${Math.max(0, Math.min(100, (x(ts) / W) * 100))}%`;
          return (
            <div key={p} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-xs text-muted">{pl(p)}</span>
              <div className="relative h-12 min-w-0 flex-1">
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line" />
                {rv.map((r, i) => (
                  <button key={i} title={r.title} aria-label={r.title} onClick={() => go((r.from + r.to) / 2)}
                    className={`absolute inset-y-0 rounded ${r.tone === "good" ? "bg-good/15" : "bg-bad/15"}`}
                    style={{ left: pct(r.from), width: `max(6px, calc(${pct(r.to)} - ${pct(r.from)}))` }} />
                ))}
                {evs.filter((e, i) => {
                  // one marker per spot: drop free throws and markers that would sit on top of the previous one
                  if (e.type === "FT") return false;
                  const prev = evs.slice(0, i).reverse().find((o) => o.type !== "FT" && o.type !== "SUB" && o.side === e.side && ((o.type === "TOV") === (e.type === "TOV")));
                  return !prev || e.type === "SUB" || x(e.videoTs) - x(prev.videoTs) > W * 0.012;
                }).map((e) => {
                  const label = `${fmtTs(e.videoTs)} · ${e.side === "opp" ? t("Adversário") : name(e.playerId)} — ${describe(e, name)}`;
                  if (e.type === "SUB") return <span key={e.id} title={label} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted/60" style={{ left: pct(e.videoTs) }} />;
                  const made = (e.type === "SHOT" || e.type === "FT") && e.meta?.made;
                  const tov = e.type === "TOV" && e.side === "us";
                  if (!made && !tov) return null;
                  const size = tov ? "h-2 w-2" : e.type === "FT" ? "h-1.5 w-1.5" : e.meta?.pts === 3 ? "h-3 w-3" : "h-2.5 w-2.5";
                  const color = tov ? "bg-bad" : e.side === "us" ? "bg-good" : "bg-opp";
                  const top = tov ? "top-1/2" : e.side === "us" ? "top-[22%]" : "top-[78%]";
                  return (
                    <button key={e.id} title={label} aria-label={label} onClick={() => go(e.videoTs)}
                      className={`absolute ${top} grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center`} style={{ left: pct(e.videoTs) }}>
                      <span className={`${size} ${color} ${tov ? "" : "rounded-full"}`} />
                    </button>
                  );
                })}
                {nts.map((n) => (
                  <button key={n.id} title={`${fmtTs(n.videoTs)} · ${n.text}`} aria-label={t("Nota: {text}", { text: n.text })} onClick={() => go(n.videoTs)}
                    className="absolute -top-1 grid h-6 w-6 -translate-x-1/2 place-items-center text-[10px] text-brand" style={{ left: pct(n.videoTs) }}>▼</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
