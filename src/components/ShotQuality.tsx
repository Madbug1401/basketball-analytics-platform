"use client";

import { useState } from "react";
import Link from "next/link";
import { Court } from "./Court";
import { fmtDiff, fmtPps, shooters, shotProfile, type QZone, type ZoneModel } from "@/lib/shotQuality";
import type { GameEvent, Player } from "@/lib/types";

/** green when good for us: our shooting above expectation, or the opponent's below */
const tone = (d: number | null, opp: boolean) => (d === null ? "" : (opp ? d < -0.05 : d > 0.05) ? "text-good" : (opp ? d > 0.05 : d < -0.05) ? "text-bad" : "");
const pc = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

/** colour of a zone: better (green) or worse (red) than the expected points per shot */
function heatColor(pps: number | null, xpps: number, a: number) {
  if (pps === null || a < 3) return "rgba(138,150,171,0.10)";
  const d = pps - xpps;
  if (d > 0.15) return "rgba(52,211,153,0.42)";
  if (d > 0.05) return "rgba(52,211,153,0.22)";
  if (d < -0.15) return "rgba(248,113,113,0.42)";
  if (d < -0.05) return "rgba(248,113,113,0.22)";
  return "rgba(255,122,26,0.16)";
}

/** Shot chart + quality by zone for one set of shots. */
export function ShotQuality({ shots, model, opp = false, clipsHref }: {
  shots: GameEvent[]; model: ZoneModel; opp?: boolean; clipsHref?: string;
}) {
  const [view, setView] = useState<"zones" | "dots">("zones");
  const p = shotProfile(shots, model);
  const heat = Object.fromEntries(p.zones.map((z) => [z.zone, heatColor(z.pps, z.xpps, z.a)])) as Record<QZone, string>;
  const marks = shots.filter((e) => e.type === "SHOT" && e.x !== undefined).map((e) => ({ id: e.id, x: e.x!, y: e.y!, made: !!e.meta?.made, side: opp ? ("opp" as const) : undefined }));
  const verdict = p.making === null ? "" : p.making > 0.05 ? (opp ? "acima do esperado — converteram bem" : "acima do esperado — boa finalização") : p.making < -0.05 ? (opp ? "abaixo do esperado — boa defesa ou falharam" : "abaixo do esperado — lançamentos que costumam entrar") : "dentro do esperado";

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="tablist" aria-label="Vista do mapa">
          <button role="tab" aria-selected={view === "zones"} className={`rounded-md px-2.5 py-1 pointer-coarse:py-1.5 ${view === "zones" ? "bg-panel-2 text-fg" : "text-muted"}`} onClick={() => setView("zones")}>Zonas</button>
          <button role="tab" aria-selected={view === "dots"} className={`rounded-md px-2.5 py-1 pointer-coarse:py-1.5 ${view === "dots" ? "bg-panel-2 text-fg" : "text-muted"}`} onClick={() => setView("dots")}>Lançamentos</button>
        </div>
        {view === "zones" && (
          <div className="flex gap-2 text-[10px] text-muted">
            <span><span className="inline-block h-2 w-2 rounded-sm bg-good/60" /> acima</span>
            <span><span className="inline-block h-2 w-2 rounded-sm bg-bad/60" /> abaixo do esperado</span>
          </div>
        )}
      </div>
      <Court shots={view === "dots" ? marks : []} heat={view === "zones" ? heat : undefined} />

      <div className="grid grid-cols-2 gap-1.5 text-center sm:grid-cols-4">
        <Stat label="Pontos por lançamento" value={fmtPps(p.pps)} />
        <Stat label="Esperado (seleção)" value={fmtPps(p.xpps)} hint="Quanto valem, em média, lançamentos daquelas zonas" />
        <Stat label="Acerto vs esperado" value={fmtDiff(p.making)} tone={tone(p.making, opp)} />
        <Stat label="Cesto + triplos" value={pc(p.rimOr3)} hint="Os lançamentos mais valiosos. Meia distância: " extra={pc(p.mid)} />
      </div>
      {verdict && <p className="text-xs text-muted">{opp ? "Adversário" : "Nós"}: {verdict}.</p>}

      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Zona</th><th>C/T</th><th>%</th><th title="Percentagem dos lançamentos">Freq.</th><th title="Pontos por lançamento">Pts/L</th><th title="Pontos por lançamento esperados nesta zona">Esp.</th></tr></thead>
          <tbody>
            {p.zones.map((z) => {
              const d = z.pps === null ? null : z.pps - z.xpps;
              return (
                <tr key={z.zone}>
                  <td>{z.zone}</td>
                  <td>{z.m}/{z.a}</td>
                  <td>{z.a ? `${Math.round((z.m / z.a) * 100)}%` : "–"}</td>
                  <td>{z.a ? pc(z.share) : "–"}</td>
                  <td className={z.a < 3 ? "" : tone(d, opp)}>{fmtPps(z.pps)}</td>
                  <td className="text-muted">{z.xpps.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>{p.fga - p.located > 0 ? `${p.fga - p.located} lançamentos sem local marcado. ` : ""}Esperado = média de todos os lançamentos registados na época por zona.</span>
        {clipsHref && p.fga > 0 && <Link className="tap text-brand print:hidden" href={clipsHref}>▶ Ver estes lançamentos</Link>}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, extra, tone = "" }: { label: string; value: string; hint?: string; extra?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line px-2 py-1.5" title={hint ? hint + (extra ?? "") : undefined}>
      <div className={`font-mono text-lg font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] leading-tight text-muted">{label}</div>
    </div>
  );
}

/** Who takes good shots and who makes them (season / several games). */
export function ShooterTable({ events, model, players, minShots = 5 }: { events: GameEvent[]; model: ZoneModel; players: Player[]; minShots?: number }) {
  const rows = shooters(events, model, minShots);
  const byId = new Map(players.map((p) => [p.id, p]));
  if (!rows.length) return <p className="text-sm text-muted">Ainda poucos lançamentos com local marcado (mín. {minShots} por jogador).</p>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Jogador</th><th>Lanç.</th>
            <th title="Pontos por lançamento">Pts/L</th>
            <th title="Pontos esperados pelos locais de onde lança (seleção de lançamento)">Seleção</th>
            <th title="Pontos por lançamento acima/abaixo do esperado">Acerto</th>
            <th title="Percentagem de lançamentos no cesto ou de 3">Cesto+3</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = byId.get(r.playerId);
            return (
              <tr key={r.playerId}>
                <td className="whitespace-nowrap">{p ? <Link className="hover:text-brand" href={`/jogadores/${p.id}`}>#{p.number} {p.name}</Link> : "?"}</td>
                <td>{r.located}</td>
                <td className="font-semibold">{fmtPps(r.pps)}</td>
                <td className={(r.xpps ?? 0) >= 0.9 ? "text-good" : (r.xpps ?? 0) < 0.78 ? "text-bad" : ""}>{fmtPps(r.xpps)}</td>
                <td className={(r.making ?? 0) > 0.05 ? "text-good" : (r.making ?? 0) < -0.05 ? "text-bad" : ""}>{fmtDiff(r.making)}</td>
                <td>{pc(r.rimOr3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted">Seleção alta = escolhe lançamentos que costumam valer mais (cesto e triplos). Acerto positivo = converte mais do que o normal nessas zonas.</p>
    </div>
  );
}
