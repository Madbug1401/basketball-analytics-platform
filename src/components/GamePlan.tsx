"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useSeason } from "@/lib/season";
import { scoutReport } from "@/lib/scouting";
import {
  AREA_LABEL, METRICS, fmtMetric, planPatch, readPlan, suggestFromKeys, verdict,
  type GamePlanItem, type PlanArea, type PlanMetric,
} from "@/lib/gameplan";
import type { Agenda, Game, GameEvent } from "@/lib/types";

const ICON = { ok: "✅", partial: "⚠️", fail: "❌", pending: "•" } as const;
const TONE = { ok: "text-good", partial: "text-brand", fail: "text-bad", pending: "text-muted" } as const;

/** Game plan before the game, "plan vs result" after it. */
export function GamePlan({ game, events, canEdit }: { game: Game; events: GameEvent[]; canEdit: boolean }) {
  const info = useLiveQuery(() => db.agenda.get(game.id), [game.id]);
  const allGames = useLiveQuery(() => db.games.where("teamId").equals(game.teamId).toArray(), [game.teamId]);
  const season = useSeason(game.teamId);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<{ area: PlanArea; text: string; metric: PlanMetric | ""; value: string }>({ area: "defesa", text: "", metric: "", value: "" });
  if (info === undefined) return null;

  const items = readPlan(info);
  const played = events.some((e) => e.type !== "PERIOD_START");
  if (!items.length && !canEdit) return null;

  const save = (next: GamePlanItem[]) => {
    const base: Agenda = info ?? { id: game.id, teamId: game.teamId, kind: "game" };
    return db.agenda.put({ ...base, ...planPatch(next) });
  };
  const addMetric = (m: PlanMetric) => {
    const d = METRICS[m];
    void save([...items, { id: uid(), area: d.area, text: d.text.replace("{v}", String(d.suggest)), check: { metric: m, op: d.op, value: d.suggest } }]);
  };
  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const text = f.text.trim();
    const val = Number(f.value.replace(",", "."));
    if (!text && !f.metric) return;
    const item: GamePlanItem = { id: uid(), area: f.area, text: text || METRICS[f.metric as PlanMetric].text.replace("{v}", String(val || METRICS[f.metric as PlanMetric].suggest)) };
    if (f.metric) item.check = { metric: f.metric, op: METRICS[f.metric].op, value: isFinite(val) && f.value ? val : METRICS[f.metric].suggest };
    void save([...items, item]);
    setF({ area: f.area, text: "", metric: "", value: "" });
    setAdding(false);
  };

  const keys = season && allGames ? scoutReport(game.opponent, season, allGames).keys : [];
  const suggested = [...new Set([...suggestFromKeys(keys), "opp_pts", "our_tov", "opp_oreb", "our_ppp"] as PlanMetric[])]
    .filter((m) => !items.some((i) => i.check?.metric === m)).slice(0, 5);
  const verdicts = items.map((i) => verdict(i, events));
  const done = verdicts.filter((v) => v.status === "ok").length;
  const share = () => {
    const lines = [`🏀 *Game plan — ${game.home ? "vs" : "@"} ${game.opponent}*`];
    (["defesa", "ataque", "geral"] as PlanArea[]).forEach((a) => {
      const list = items.filter((i) => i.area === a);
      if (list.length) lines.push("", `*${AREA_LABEL[a]}*`, ...list.map((i) => `☐ ${i.text}`));
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  };

  return (
    <section id="plano" className="card scroll-mt-20 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h2 className="font-semibold">{played ? "Game plan vs resultado" : "Game plan"}</h2>
          <p className="text-xs text-muted">
            {played ? (items.length ? `${done} de ${items.length} objetivos cumpridos (verificados com os dados do jogo)` : "Sem plano para este jogo.") : "Os objetivos para este jogo. Depois do jogo, a app verifica-os sozinha."}
          </p>
        </div>
        <div className="flex gap-1.5">
          {items.length > 0 && <button className="btn px-2.5 py-1 text-xs" onClick={share}>WhatsApp</button>}
          {canEdit && <button className={`btn px-2.5 py-1 text-xs ${adding ? "btn-primary" : ""}`} onClick={() => setAdding(!adding)}>{adding ? "Fechar" : "+ Objetivo"}</button>}
        </div>
      </div>

      {(["defesa", "ataque", "geral"] as PlanArea[]).map((a) => {
        const list = items.map((it, i) => ({ it, v: verdicts[i] })).filter((x) => x.it.area === a);
        if (!list.length) return null;
        return (
          <div key={a} className="border-b border-line/60 px-3 py-2 last:border-b-0">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{AREA_LABEL[a]}</div>
            <ul className="grid gap-1.5">
              {list.map(({ it, v }) => (
                <li key={it.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="w-6 shrink-0 text-center" aria-label={v.status}>{played ? ICON[v.status] : "☐"}</span>
                  <span className="min-w-0 flex-1">{it.text}</span>
                  {played && it.check && <span className={`font-mono text-xs ${TONE[v.status]}`}>{fmtMetric(it.check.metric, v.value)} {it.check.op === "lte" ? "≤" : "≥"} {fmtMetric(it.check.metric, it.check.value)}</span>}
                  {played && !it.check && canEdit && (
                    <span className="flex gap-1">
                      {(["ok", "partial", "fail"] as const).map((r) => (
                        <button key={r} className={`grid h-8 w-8 place-items-center rounded-md border text-xs ${it.result === r ? "border-brand bg-brand/10" : "border-line opacity-60"}`}
                          onClick={() => save(items.map((x) => (x.id === it.id ? { ...x, result: x.result === r ? undefined : r } : x)))} aria-label={r}>{ICON[r]}</button>
                      ))}
                    </span>
                  )}
                  {canEdit && (
                    <button className="grid h-8 w-7 place-items-center text-muted hover:text-bad" aria-label="Tirar do plano"
                      onClick={() => save(items.filter((x) => x.id !== it.id))}>✕</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {canEdit && (adding || !items.length) && (
        <div className="grid gap-3 border-t border-line bg-bg/40 px-3 py-3">
          {suggested.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-muted">Sugestões{keys.length ? " (a partir do scouting)" : ""} — verificadas automaticamente:</div>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((m) => (
                  <button key={m} className="rounded-full border border-brand/50 px-2.5 py-1 text-xs text-brand hover:bg-brand/10 pointer-coarse:py-1.5" onClick={() => addMetric(m)}>
                    + {METRICS[m].text.replace("{v}", String(METRICS[m].suggest))}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={addCustom} className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <select className="input w-full sm:w-auto" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as PlanArea })} aria-label="Área">
              {(Object.keys(AREA_LABEL) as PlanArea[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </select>
            <input className="input" placeholder="Ex.: Forçar o #7 para a mão esquerda" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
            <select className="input w-full sm:w-auto" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as PlanMetric | "" })} aria-label="Verificação automática">
              <option value="">Sem verificação automática</option>
              {(Object.keys(METRICS) as PlanMetric[]).map((m) => <option key={m} value={m}>{METRICS[m].label} {METRICS[m].op === "lte" ? "≤" : "≥"}</option>)}
            </select>
            <div className="flex gap-2">
              {f.metric && <input className="input w-24" inputMode="decimal" placeholder={String(METRICS[f.metric].suggest)} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} aria-label="Valor" />}
              <button className="btn btn-primary flex-1">Adicionar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
