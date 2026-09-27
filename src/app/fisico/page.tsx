"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, today } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { StaffOnly } from "@/components/Guard";
import { ask } from "@/components/Dialog";
import {
  MEASURE, MEASURES, apeIndex, fmtDelta, fmtValue, growthTone, growthVelocity, latestOf, parseNum, plausible,
  resultOf, saveSession, teamAverage, trendOf, type MeasureDef,
} from "@/lib/physical";
import type { MeasureType, Measurement, Player } from "@/lib/types";
import { locale, t } from "@/lib/i18n";

export default function PhysicalPageGuarded() {
  return <StaffOnly><PhysicalPage /></StaffOnly>;
}

const shortDate = (d: string) => new Date(d + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "2-digit" });

function PhysicalPage() {
  const { team } = useTeam();
  const data = useLiveQuery(async () => {
    if (!team) return undefined;
    const [players, all, practices] = await Promise.all([
      db.players.where("teamId").equals(team.id).filter((p) => p.active).sortBy("number"),
      db.measurements.where("teamId").equals(team.id).toArray(),
      db.practices.where("teamId").equals(team.id).toArray(),
    ]);
    return { players, all, practices };
  }, [team?.id]);
  const [tab, setTab] = useState<"team" | "new" | "sessions">("team");
  if (!team || !data) return null;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("Perfil físico")}</h1>
        <p className="text-sm text-muted">{t("Medidas e testes de cada atleta ao longo do tempo. Cada medição fica guardada com data — nada se sobrescreve.")}</p>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-line p-1 text-sm" role="tablist">
        {([["team", t("Equipa")], ["new", t("Nova sessão de testes")], ["sessions", t("Sessões")]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 ${tab === k ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{l}</button>
        ))}
      </div>
      {tab === "team" && <TeamTable players={data.players} all={data.all} onNew={() => setTab("new")} />}
      {tab === "new" && <NewSession teamId={team.id} players={data.players} all={data.all} practices={data.practices} onDone={() => setTab("team")} />}
      {tab === "sessions" && <Sessions all={data.all} players={data.players} />}
    </div>
  );
}

/* ---------- team overview ---------- */

function TeamTable({ players, all, onNew }: { players: Player[]; all: Measurement[]; onNew: () => void }) {
  const cols = MEASURES.filter((d) => all.some((m) => m.type === d.type));
  if (!all.length) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">{t("Ainda sem medições. Começa por uma sessão de início de época: altura, peso, envergadura, alcance e os 4 testes.")}</p>
        <button className="btn btn-primary mt-3" onClick={onNew}>{t("Nova sessão de testes")}</button>
      </div>
    );
  }
  return (
    <section className="card overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-panel">{t("Atleta")}</th>
            {cols.map((d) => <th key={d.type} className="whitespace-nowrap" title={t(d.label)}>{t(d.short)} <span className="font-normal normal-case text-muted">({d.unit})</span></th>)}
            <th title={t("Crescimento em cm por ano (≥ 7 = provável pico de crescimento)")}>{t("Cresc.")}</th>
            <th title={t("Envergadura − altura")}>{t("Env−Alt")}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const g = growthVelocity(all, p.id);
            const ape = apeIndex(all, p.id);
            return (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-panel"><Link href={`/jogadores/${p.id}#fisico`} className="hover:text-brand"><b className="font-mono">#{p.number}</b> {p.name.split(" ")[0]}</Link></td>
                {cols.map((d) => {
                  const tr = trendOf(all, p.id, d.type);
                  return (
                    <td key={d.type} className="whitespace-nowrap">
                      <span className={`font-mono ${tr.last?.protocolOk === false ? "text-brand" : ""}`} title={tr.last ? `${shortDate(tr.last.date)}${tr.last.protocolOk === false ? ` · ${t("fora do protocolo")}` : ""}` : undefined}>
                        {tr.last ? fmtValue(d.type, tr.last.value).replace(` ${d.unit}`, "") : "–"}
                      </span>
                      {tr.delta !== null && <span className={`ml-1 font-mono text-[10px] ${d.kind === "body" || tr.better === null ? "text-muted" : tr.better ? "text-good" : "text-bad"}`}>{fmtDelta(d.type, tr.delta)}</span>}
                    </td>
                  );
                })}
                <td className={`whitespace-nowrap font-mono ${g ? growthTone(g.cmPerYear) : ""}`}>{g ? g.cmPerYear.toFixed(1).replace(".", ",") : "–"}</td>
                <td className="font-mono">{ape === null ? "–" : `${ape > 0 ? "+" : ""}${ape.toFixed(0)}`}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky left-0 bg-panel text-xs text-muted">{t("Média")}</td>
            {cols.map((d) => { const a = teamAverage(all, players, d.type); return <td key={d.type} className="font-mono text-xs text-muted">{a === null ? "–" : fmtValue(d.type, a).replace(` ${d.unit}`, "")}</td>; })}
            <td /><td />
          </tr>
        </tfoot>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted">{t("Valor mais recente e variação desde a 1.ª medição (verde = melhorou). Laranja = medição fora do protocolo. Crescimento ≥ 7 cm/ano: provável pico de crescimento — atenção à carga.")}</p>
    </section>
  );
}

/* ---------- new session ---------- */

type Entry = string[]; // body: [value]; tests: 3 attempts

function NewSession({ teamId, players, all, practices, onDone }: { teamId: string; players: Player[]; all: Measurement[]; practices: { id: string; date: string; title?: string }[]; onDone: () => void }) {
  const { profile } = useAuth();
  const [date, setDate] = useState(today());
  const [evaluator, setEvaluator] = useState(profile?.fullName ?? "");
  const [protocol, setProtocol] = useState({ same: true, warmup: true, three: true });
  const [notes, setNotes] = useState("");
  const [types, setTypes] = useState<MeasureType[]>(["altura", "peso", "envergadura", "alcance", "cmj", "salto_balanco", "lane", "sprint"]);
  const [cur, setCur] = useState<MeasureType>("altura");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const practiceToday = practices.find((p) => p.date === date);

  const key = (mt: MeasureType, pid: string) => `${mt}:${pid}`;
  const get = (mt: MeasureType, pid: string, i: number) => entries[key(mt, pid)]?.[i] ?? "";
  const set = (mt: MeasureType, pid: string, i: number, v: string) =>
    setEntries((e) => { const arr = [...(e[key(mt, pid)] ?? ["", "", ""])]; arr[i] = v; return { ...e, [key(mt, pid)]: arr }; });

  /** reach for jumps: typed in this session, else the latest one measured */
  const reachOf = (pid: string) => parseNum(get("alcance", pid, 0)) ?? latestOf(all, pid, "alcance", date)?.value;

  const computed = useMemo(() => {
    const rows: { def: MeasureDef; player: Player; value: number; attempts?: number[]; base?: number; bad: boolean }[] = [];
    const missingReach: string[] = [];
    for (const mt of types) {
      const def = MEASURE[mt];
      for (const p of players) {
        const raw = entries[key(mt, p.id)] ?? [];
        const nums = raw.slice(0, def.attempts ? 3 : 1).map(parseNum).filter((v): v is number => v !== null);
        if (!nums.length) continue;
        const base = def.jump ? reachOf(p.id) : undefined;
        if (def.jump && !base) { missingReach.push(`#${p.number}`); continue; }
        const value = def.attempts ? resultOf(mt, nums, base) : nums[0];
        if (value === null) continue;
        // jumps: check the marks themselves too (a mark below the reach is a typo)
        const bad = !plausible(mt, value) || (!!def.jump && nums.some((n) => n <= (base ?? 0)));
        rows.push({ def, player: p, value, attempts: def.attempts ? nums : undefined, base, bad });
      }
    }
    return { rows, missingReach: [...new Set(missingReach)] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, types, players, all, date]);

  const protocolOk = protocol.same && protocol.warmup && protocol.three;
  const doneCount = (mt: MeasureType) => computed.rows.filter((r) => r.def.type === mt).length;

  const save = async () => {
    setMsg("");
    const { rows, missingReach } = computed;
    if (!rows.length) return setMsg(t("Ainda não há valores para guardar."));
    if (missingReach.length) return setMsg(t("Falta o alcance parado de {who} para calcular o salto.", { who: missingReach.join(", ") }));
    const bad = rows.filter((r) => r.bad);
    if (bad.length && !(await ask(t("{n} valor(es) parecem estranhos (ex.: {measure} de #{num}: {value}). Guardar mesmo assim?", { n: bad.length, measure: t(bad[0].def.short), num: bad[0].player.number, value: fmtValue(bad[0].def.type, bad[0].value) }), { confirmText: t("Guardar") }))) return;
    setBusy(true);
    const note = [!protocol.same && "avaliador diferente", !protocol.warmup && "sem aquecimento padrão", !protocol.three && "menos de 3 tentativas", notes.trim()].filter(Boolean).join(" · ") || undefined;
    await saveSession(rows.map((r) => ({
      teamId, playerId: r.player.id, type: r.def.type, value: Math.round(r.value * 100) / 100, date,
      attempts: r.attempts, base: r.base, evaluator: evaluator.trim() || undefined,
      protocolOk: r.def.kind === "test" ? protocolOk : undefined, notes: note,
    })));
    setBusy(false);
    setEntries({});
    setMsg(t("✓ {n} medições guardadas.", { n: rows.length }));
    onDone();
  };

  const def = MEASURE[cur];
  return (
    <div className="grid gap-4">
      <section className="card grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="f-date">{t("Data")}</label>
          <input id="f-date" type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          {practiceToday && <p className="mt-1 text-[11px] text-muted">{t("No treino: {title}", { title: practiceToday.title || t("Treino") })}</p>}
        </div>
        <div>
          <label className="label" htmlFor="f-eval">{t("Avaliador")}</label>
          <input id="f-eval" className="input" value={evaluator} onChange={(e) => setEvaluator(e.target.value)} placeholder={t("Quem mede")} />
        </div>
        <div>
          <span className="label">{t("Protocolo dos testes")}</span>
          <div className="grid gap-1 text-sm">
            {([["same", t("Mesmo avaliador de sempre")], ["warmup", t("Aquecimento padrão feito")], ["three", t("3 tentativas por teste")]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={protocol[k]} onChange={(e) => setProtocol({ ...protocol, [k]: e.target.checked })} />
                {l}
              </label>
            ))}
          </div>
          {!protocolOk && <p className="mt-1 text-[11px] text-brand">{t("Os testes desta sessão ficam marcados “fora do protocolo” e não contam como ponto de partida da evolução.")}</p>}
        </div>
        <div className="sm:col-span-3">
          <span className="label">{t("O que vais medir hoje")}</span>
          <div className="flex flex-wrap gap-1.5">
            {MEASURES.map((d) => {
              const on = types.includes(d.type);
              return (
                <button key={d.type} aria-pressed={on} onClick={() => {
                    const next = MEASURES.map((m) => m.type).filter((mt) => (mt === d.type ? !on : types.includes(mt)));
                    setTypes(next);
                    if (!on) setCur(d.type);
                    else if (cur === d.type && next.length) setCur(next[0]);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs pointer-coarse:py-1.5 ${on ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"}`}>
                  {t(d.short)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {types.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-line p-1.5" role="tablist" aria-label={t("Medida")}>
            {types.map((mt) => (
              <button key={mt} role="tab" aria-selected={cur === mt} onClick={() => setCur(mt)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${cur === mt ? "bg-panel-2 text-fg" : "text-muted"}`}>
                {t(MEASURE[mt].short)} {doneCount(mt) > 0 && <span className="text-[10px] text-good">{doneCount(mt)}</span>}
              </button>
            ))}
          </div>
          {types.includes(cur) && (
            <div className="grid gap-2 p-3">
              <div>
                <div className="font-semibold">{t(def.label)} <span className="font-normal text-muted">({def.unit}{def.jump ? ` — ${t("marca atingida")}` : ""})</span></div>
                <p className="text-xs text-muted">{t(def.how)}</p>
              </div>
              <ul className="divide-y divide-line/60">
                {players.map((p) => {
                  const r = computed.rows.find((x) => x.def.type === cur && x.player.id === p.id);
                  const prevM = latestOf(all, p.id, cur, date);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <span className="w-24 shrink-0 truncate text-sm"><b className="font-mono">#{p.number}</b> {p.name.split(" ")[0]}</span>
                      <span className="flex gap-1">
                        {Array.from({ length: def.attempts ? 3 : 1 }, (_, i) => (
                          <input key={i} className={`input w-16 px-1.5 py-1 text-center font-mono pointer-coarse:w-[4.5rem] ${r?.bad ? "border-bad" : ""}`} inputMode="decimal"
                            aria-label={`${t(def.short)} ${p.name}${def.attempts ? ` ${t("tentativa {n}", { n: i + 1 })}` : ""}`} placeholder={def.attempts ? t("{n}.ª", { n: i + 1 }) : def.unit}
                            value={get(cur, p.id, i)} onChange={(e) => set(cur, p.id, i, e.target.value)} />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 text-right text-xs">
                        {r ? <b className={`font-mono ${r.bad ? "text-bad" : "text-good"}`}>{fmtValue(cur, r.value)}</b> : null}
                        {def.jump && get(cur, p.id, 0) && !reachOf(p.id) && <span className="text-bad">{t("falta o alcance")}</span>}
                        {prevM && <span className="ml-1 text-muted">{t("antes {value}", { value: fmtValue(cur, prevM.value) })}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="card grid gap-2 p-4">
        <label className="label" htmlFor="f-notes">{t("Notas da sessão (opcional)")}</label>
        <input id="f-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Ex.: piso molhado, reavaliação pós-lesão do #7")} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={save} disabled={busy}>{computed.rows.length ? t("Guardar {n} medições", { n: computed.rows.length }) : t("Guardar sessão")}</button>
          {msg && <span className={`text-sm ${msg.startsWith("✓") ? "text-good" : "text-bad"}`}>{msg}</span>}
        </div>
      </section>
    </div>
  );
}

/* ---------- sessions ---------- */

function Sessions({ all, players }: { all: Measurement[]; players: Player[] }) {
  const sessions = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    for (const m of all) { if (m.fromTeam) continue; const k = m.sessionId ?? m.id; map.set(k, [...(map.get(k) ?? []), m]); }
    return [...map.entries()].map(([id, ms]) => ({ id, ms, date: ms[0].date })).sort((a, b) => b.date.localeCompare(a.date));
  }, [all]);
  const byId = new Map(players.map((p) => [p.id, p]));
  if (!sessions.length) return <p className="card p-4 text-sm text-muted">{t("Ainda sem sessões.")}</p>;
  return (
    <ul className="grid gap-2">
      {sessions.map((s) => {
        const types = [...new Set(s.ms.map((m) => m.type))];
        const off = s.ms.some((m) => m.protocolOk === false);
        return (
          <li key={s.id} className="card flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="font-semibold">{shortDate(s.date)}</span>
            <span className="text-muted">{t("{n} atletas", { n: new Set(s.ms.map((m) => m.playerId)).size })} · {types.map((mt) => t(MEASURE[mt].short)).join(", ")}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{s.ms[0].evaluator ?? ""}{s.ms[0].notes ? ` · ${s.ms[0].notes}` : ""}</span>
            {off ? <span className="text-xs text-brand">{t("⚠ fora do protocolo")}</span> : <span className="text-xs text-good">{t("✓ protocolo")}</span>}
            <button className="tap -my-1 px-1 text-muted hover:text-bad" aria-label={t("Apagar sessão")}
              onClick={async () => { if (await ask(t("Apagar as {n} medições de {date}?", { n: s.ms.length, date: shortDate(s.date) }), { confirmText: t("Apagar"), danger: true })) await db.measurements.bulkDelete(s.ms.map((m) => m.id)); }}>✕</button>
            <details className="w-full text-xs">
              <summary className="cursor-pointer text-muted">{t("Ver valores")}</summary>
              <div className="mt-1 grid gap-0.5 sm:grid-cols-2">
                {s.ms.map((m) => <span key={m.id}>#{byId.get(m.playerId)?.number ?? "?"} {byId.get(m.playerId)?.name.split(" ")[0] ?? ""} · {t(MEASURE[m.type].short)}: <b className="font-mono">{fmtValue(m.type, m.value)}</b></span>)}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
