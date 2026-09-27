"use client";

import { useMemo, useState } from "react";
import { combos, gameUnits, mergeUnits, minutesRows, onOff, rate, type Rated } from "@/lib/lineups";
import type { Game, GameEvent, ID, Player } from "@/lib/types";
import { t } from "@/lib/i18n";

type Tab = "units" | "onoff" | "duos" | "trios" | "minutes";

const fmtNet = (v: number | null) => (v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(0)}`);
const netClass = (v: number | null) => (v === null ? "text-muted" : v > 0 ? "text-good" : v < 0 ? "text-bad" : "");

/** 5-man units, on/off, duos/trios and minutes — for one game or the whole season. */
export function LineupAnalysis({ games, players, season }: {
  games: { game: Game; events: GameEvent[]; min?: Map<ID, number> }[];
  players: Player[];
  season?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("units");
  const [sort, setSort] = useState<"min" | "net">("min");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const units = useMemo(() => mergeUnits(games.map((g) => gameUnits(g.events, g.game))), [games]);
  const minMin = season ? 4 : 1.5;

  const label = (ids: ID[]) => ids.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a!.number - b!.number).map((p) => `#${p!.number}`).join(" · ");
  const name = (id: ID) => { const p = byId.get(id); return p ? `#${p.number} ${p.name.split(" ")[0]}` : "?"; };
  const sorter = (a: Rated, b: Rated) => (sort === "min" ? b.min - a.min : (b.net100 ?? -999) - (a.net100 ?? -999));

  const rows = useMemo(() => {
    if (tab === "units") return [...units.values()].map((u) => rate(u.ids, u.secs, u.us, u.opp, u.possUs, u.possOpp));
    if (tab === "duos") return combos(units, 2);
    if (tab === "trios") return combos(units, 3);
    return [];
  }, [tab, units]);
  const oo = useMemo(() => (tab === "onoff" ? onOff(units, players.map((p) => p.id)) : []), [tab, units, players]);
  const mins = useMemo(() => {
    if (tab !== "minutes") return [];
    const g0 = games[0]?.game;
    return minutesRows(games.map((g) => ({ min: g.min ?? new Map() })), players.map((p) => p.id), g0?.periodMinutes ?? 10, g0?.periods ?? 4);
  }, [tab, games, players]);

  const hasUnits = units.size > 0;
  const TABS: [Tab, string][] = [["units", t("Quintetos")], ["onoff", t("Com / sem")], ["duos", t("Duplas")], ["trios", t("Trios")], ...(season ? [["minutes", t("Minutos")] as [Tab, string]] : [])];

  return (
    <div className="card h-fit overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">{t("Quintetos e minutos")}</h2>
          <p className="text-xs text-muted">{t("Saldo por 100 posses (+/- ajustado ao ritmo). Minutos exatos no modo ao vivo; estimados no registo por vídeo.")}</p>
        </div>
        {tab !== "onoff" && tab !== "minutes" && (
          <div className="flex gap-1 text-xs">
            <button className={`btn px-2 py-1 text-xs ${sort === "min" ? "btn-primary" : ""}`} onClick={() => setSort("min")}>{t("Mais minutos")}</button>
            <button className={`btn px-2 py-1 text-xs ${sort === "net" ? "btn-primary" : ""}`} onClick={() => setSort("net")}>{t("Melhor saldo")}</button>
          </div>
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full border px-3 py-1 text-xs pointer-coarse:py-1.5 ${tab === k ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"}`}>{l}</button>
        ))}
      </div>

      {!hasUnits && tab !== "minutes" ? (
        <p className="p-6 text-center text-sm text-muted">{t("Regista o 5 inicial e as substituições para ver os quintetos.")}</p>
      ) : tab === "onoff" ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{t("Jogador")}</th><th>{t("Min")}</th><th title={t("Saldo por 100 posses com o jogador em campo")}>{t("Em campo")}</th><th title={t("Saldo por 100 posses com o jogador no banco")}>{t("No banco")}</th><th>{t("Diferença")}</th></tr></thead>
            <tbody>
              {oo.sort((a, b) => (b.diff ?? -999) - (a.diff ?? -999)).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{name(r.id)}</td>
                  <td>{r.on.min.toFixed(0)}</td>
                  <td className={netClass(r.on.net100)}>{fmtNet(r.on.net100)}</td>
                  <td className={netClass(r.off.net100)}>{fmtNet(r.off.net100)}</td>
                  <td className={`font-semibold ${netClass(r.diff)}`}>{fmtNet(r.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted">{t("Diferença positiva: a equipa rende mais com este jogador em campo. Com poucos minutos, os números oscilam muito.")}</p>
        </div>
      ) : tab === "minutes" ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{t("Jogador")}</th><th>{t("Jogos")}</th><th>{t("Min/jogo")}</th><th>{t("Últ. 3")}</th><th>{t("Máx.")}</th></tr></thead>
            <tbody>
              {mins.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="whitespace-nowrap">{name(r.id)}</div>
                    {r.alert && <div className={`text-[11px] ${r.alert.tone === "bad" ? "text-bad" : "text-muted"}`}>{r.alert.tone === "bad" ? "⚠ " : ""}{r.alert.text}</div>}
                  </td>
                  <td>{r.games}</td>
                  <td className="font-semibold">{r.avg.toFixed(1)}</td>
                  <td>{r.last3 === null ? "–" : r.last3.toFixed(1)}</td>
                  <td>{r.max.toFixed(0)}</td>
                </tr>
              ))}
              {mins.length === 0 && <tr><td colSpan={5} className="py-6 text-center! text-muted">{t("Sem minutos registados.")}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{tab === "units" ? t("Quinteto") : tab === "duos" ? t("Dupla") : t("Trio")}</th><th>{t("Min")}</th><th>{t("Posses")}</th><th>+/-</th><th title={t("Saldo por 100 posses")}>{t("Por 100")}</th><th title={t("Pontos marcados por 100 posses")}>{t("Ataque")}</th><th title={t("Pontos sofridos por 100 posses")}>{t("Defesa")}</th><th title={t("% de posses perdidas")}>{t("Perdas")}</th><th title={t("% dos ressaltos ofensivos disponíveis")}>{t("R. of.")}</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.min >= minMin).sort(sorter).slice(0, 15).map((r) => (
                <tr key={r.ids.join()}>
                  <td className="whitespace-nowrap">{label(r.ids)}</td>
                  <td>{r.min.toFixed(0)}</td>
                  <td className="text-muted">{Math.round(r.poss)}</td>
                  <td className={netClass(r.pf - r.pa)}>{r.pf - r.pa > 0 ? "+" : ""}{r.pf - r.pa}</td>
                  <td className={`font-semibold ${netClass(r.net100)}`}>{fmtNet(r.net100)}</td>
                  <td>{r.ortg === null ? "–" : r.ortg.toFixed(0)}</td>
                  <td>{r.drtg === null ? "–" : r.drtg.toFixed(0)}</td>
                  <td className="text-muted">{r.tovPct === null ? "–" : `${r.tovPct.toFixed(0)}%`}</td>
                  <td className="text-muted">{r.orebPct === null ? "–" : `${r.orebPct.toFixed(0)}%`}</td>
                </tr>
              ))}
              {rows.filter((r) => r.min >= minMin).length === 0 && <tr><td colSpan={9} className="py-6 text-center! text-muted">{t("Ainda sem minutos suficientes.")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
