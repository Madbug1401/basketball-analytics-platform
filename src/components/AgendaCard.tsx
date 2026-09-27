"use client";

import Link from "next/link";
import { useState } from "react";
import { db } from "@/lib/db";
import { callupText, dayLabel, expected, rsvpCounts, type AgendaItem } from "@/lib/agenda";
import { readPlan } from "@/lib/gameplan";
import { RSVP_LABEL, type Agenda, type ID, type Player, type RsvpStatus } from "@/lib/types";
import { askText } from "./Dialog";

const RS_STYLE: Record<RsvpStatus, string> = {
  yes: "border-good bg-good/15 text-good",
  maybe: "border-brand bg-brand/15 text-brand",
  no: "border-bad bg-bad/15 text-bad",
};
const RS_ICON: Record<RsvpStatus, string> = { yes: "✓", maybe: "?", no: "✗" };

export async function answer(it: AgendaItem, teamId: ID, playerId: ID, status: RsvpStatus, askNote = true) {
  let note = it.rsvps.get(playerId)?.note;
  if (status === "no" && askNote) {
    const v = await askText("Queres dizer porquê? (opcional)", { confirmText: "Enviar" });
    if (v === null) return; // cancelled
    note = v.trim() || undefined;
  } else if (status !== "no") note = undefined;
  await db.rsvps.put({ id: `${it.id}:${playerId}`, teamId, refId: it.id, playerId, status, note, answeredAt: Date.now() });
}

function saveInfo(it: AgendaItem, teamId: ID, patch: Partial<Agenda>) {
  const base: Agenda = it.info ?? { id: it.id, teamId, kind: it.kind };
  return db.agenda.put({ ...base, ...patch });
}

export function AgendaCard({ it, players, teamId, teamName, canEdit, myPlayerId, compact }: {
  it: AgendaItem; players: Player[]; teamId: ID; teamName: string; canEdit: boolean; myPlayerId?: ID; compact?: boolean;
}) {
  const [open, setOpen] = useState<"none" | "details" | "callup" | "answers">("none");
  const d = new Date(it.date + "T12:00");
  const c = rsvpCounts(it, players);
  const mine = myPlayerId ? it.rsvps.get(myPlayerId) : undefined;
  const callup = it.info?.callup ?? [];
  const published = !!it.info?.published && callup.length > 0;
  const iAmCalled = myPlayerId ? callup.includes(myPlayerId) : false;
  const href = it.kind === "game" ? (it.hasEvents || !canEdit ? `/jogos/${it.id}` : `/jogos/${it.id}/ao-vivo`) : canEdit ? `/treinos/${it.id}` : undefined;
  const share = () => {
    const text = callupText(it, players, teamName, window.location.origin);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className={`card overflow-hidden ${it.kind === "game" ? "border-l-4 border-l-brand" : ""}`}>
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="grid h-14 w-12 shrink-0 place-items-center rounded-lg bg-panel-2 text-center leading-none">
          <div>
            <div className="font-mono text-xl font-bold">{d.getDate()}</div>
            <div className="mt-0.5 text-[10px] uppercase text-muted">{d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "")}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">{dayLabel(it.date)}{it.info?.time ? ` · ${it.info.time}` : ""}{it.info?.meetTime ? ` (conc. ${it.info.meetTime})` : ""}</div>
          <div className="truncate font-semibold">
            <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${it.kind === "game" ? "bg-brand/15 text-brand" : "bg-opp/15 text-opp"}`}>{it.kind === "game" ? "Jogo" : "Treino"}</span>
            {href ? <Link href={href} className="hover:text-brand">{it.title}</Link> : it.title}
          </div>
          {it.info?.location && <div className="truncate text-xs text-muted">📍 {it.info.location}</div>}
          {it.info?.note && !compact && <div className="mt-1 text-sm text-muted">{it.info.note}</div>}
        </div>
      </div>

      {/* player: own answer */}
      {myPlayerId && (
        <div className="border-t border-line px-3 py-2.5 sm:px-4">
          {it.kind === "game" && (
            <div className={`mb-2 text-xs ${published ? (iAmCalled ? "font-semibold text-good" : "text-muted") : "text-muted"}`}>
              {published ? (iAmCalled ? "✓ Estás convocado" : "Não estás na convocatória deste jogo") : "Convocatória ainda não publicada"}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {(["yes", "maybe", "no"] as RsvpStatus[]).map((s) => (
              <button key={s} onClick={() => answer(it, teamId, myPlayerId, s)}
                className={`min-h-10 rounded-lg border text-sm font-medium ${mine?.status === s ? RS_STYLE[s] : "border-line text-muted hover:text-fg"}`}>
                {RS_ICON[s]} {RSVP_LABEL[s]}
              </button>
            ))}
          </div>
          {mine?.note && <p className="mt-1.5 text-xs text-muted">A tua nota: {mine.note}</p>}
          {it.kind === "game" && readPlan(it.info).length > 0 && <Link href={`/jogos/${it.id}#plano`} className="tap text-xs text-brand">Ver o game plan →</Link>}
        </div>
      )}

      {/* staff */}
      {canEdit && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-xs sm:px-4">
            <button className="tap -my-1 flex items-center gap-2 font-medium" onClick={() => setOpen(open === "answers" ? "none" : "answers")} aria-expanded={open === "answers"}>
              <span className="text-good">✓ {c.yes}</span>
              <span className="text-brand">? {c.maybe}</span>
              <span className="text-bad">✗ {c.no}</span>
              <span className="text-muted">· {c.none} sem resposta</span>
              <span className="text-muted">{open === "answers" ? "▴" : "▾"}</span>
            </button>
            {it.kind === "game" && (
              <span className={`${published ? "text-good" : "text-muted"}`}>{callup.length ? `${callup.length} convocados${published ? "" : " (rascunho)"}` : "sem convocatória"}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2 sm:px-4">
            <button className={`btn px-2.5 py-1 text-xs ${open === "details" ? "btn-primary" : ""}`} onClick={() => setOpen(open === "details" ? "none" : "details")}>Hora e local</button>
            {it.kind === "game" && <button className={`btn px-2.5 py-1 text-xs ${open === "callup" ? "btn-primary" : ""}`} onClick={() => setOpen(open === "callup" ? "none" : "callup")}>Convocatória</button>}
            <button className="btn px-2.5 py-1 text-xs" onClick={share}>WhatsApp</button>
            {it.kind === "game" && it.game && <Link className="btn px-2.5 py-1 text-xs" href={`/adversarios?nome=${encodeURIComponent(it.game.opponent)}`}>Scouting</Link>}
            {it.kind === "game" && <Link className="btn px-2.5 py-1 text-xs" href={`/jogos/${it.id}#plano`}>Game plan</Link>}
          </div>
          {open === "details" && <DetailsEditor it={it} teamId={teamId} />}
          {open === "callup" && <CallupEditor it={it} players={players} teamId={teamId} />}
          {open === "answers" && <AnswersList it={it} players={players} teamId={teamId} />}
        </>
      )}
    </div>
  );
}

function DetailsEditor({ it, teamId }: { it: AgendaItem; teamId: ID }) {
  const [f, setF] = useState({ time: it.info?.time ?? "", meetTime: it.info?.meetTime ?? "", location: it.info?.location ?? "", note: it.info?.note ?? "" });
  const save = async () => {
    await saveInfo(it, teamId, { time: f.time || undefined, meetTime: f.meetTime || undefined, location: f.location.trim() || undefined, note: f.note.trim() || undefined });
  };
  return (
    <div className="grid gap-2 border-t border-line bg-bg/40 px-3 py-3 sm:grid-cols-2 sm:px-4">
      <div><label className="label">Hora</label><input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} onBlur={save} /></div>
      <div><label className="label">Concentração</label><input type="time" className="input" value={f.meetTime} onChange={(e) => setF({ ...f, meetTime: e.target.value })} onBlur={save} /></div>
      <div className="sm:col-span-2"><label className="label">Local</label><input className="input" placeholder="Pavilhão…" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} onBlur={save} /></div>
      <div className="sm:col-span-2"><label className="label">Mensagem para os jogadores</label><input className="input" placeholder="Ex.: trazer equipamento branco" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onBlur={save} /></div>
      <div className="sm:col-span-2"><button className="btn btn-primary" onClick={save}>Guardar</button></div>
    </div>
  );
}

function CallupEditor({ it, players, teamId }: { it: AgendaItem; players: Player[]; teamId: ID }) {
  const [sel, setSel] = useState<ID[]>(it.info?.callup ?? []);
  const toggle = (id: ID) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const save = (published: boolean) => saveInfo(it, teamId, { callup: sel, published });
  return (
    <div className="border-t border-line bg-bg/40 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>{sel.length} selecionados · toca para escolher</span>
        <span className="flex gap-3">
          <button className="tap -my-2 text-brand" onClick={() => setSel(players.map((p) => p.id))}>Todos</button>
          <button className="tap -my-2 text-brand" onClick={() => setSel([])}>Nenhum</button>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {players.map((p) => {
          const r = it.rsvps.get(p.id);
          const on = sel.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} aria-pressed={on}
              className={`flex min-h-10 items-center gap-1.5 truncate rounded-lg border px-2 text-left text-sm ${on ? "border-brand bg-brand/15" : "border-line text-muted"}`}>
              <b className="font-mono">#{p.number}</b> <span className="truncate">{p.name.split(" ")[0]}</span>
              {r && <span className={`ml-auto text-xs ${r.status === "yes" ? "text-good" : r.status === "no" ? "text-bad" : "text-brand"}`}>{RS_ICON[r.status]}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => save(true)} disabled={!sel.length}>Publicar convocatória</button>
        <button className="btn" onClick={() => save(false)}>Guardar rascunho</button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Depois de publicar, os jogadores veem se estão convocados. Usa o botão WhatsApp para avisar o grupo.</p>
    </div>
  );
}

function AnswersList({ it, players, teamId }: { it: AgendaItem; players: Player[]; teamId: ID }) {
  const list = expected(it, players);
  const cycle: (RsvpStatus | undefined)[] = [undefined, "yes", "maybe", "no"];
  const set = async (p: Player) => {
    const cur = it.rsvps.get(p.id)?.status;
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    if (!next) await db.rsvps.delete(`${it.id}:${p.id}`);
    else await answer(it, teamId, p.id, next, false);
  };
  return (
    <div className="border-t border-line bg-bg/40 px-3 py-2 sm:px-4">
      <ul className="divide-y divide-line/50">
        {list.map((p) => {
          const r = it.rsvps.get(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
              <b className="w-8 shrink-0 font-mono">#{p.number}</b>
              <span className="min-w-0 flex-1 truncate">{p.name}{r?.note && <span className="text-muted"> — {r.note}</span>}</span>
              <button onClick={() => set(p)} title="Tocar para mudar (se o jogador respondeu por outro meio)"
                className={`min-h-9 min-w-24 rounded-lg border px-2 text-xs ${r ? RS_STYLE[r.status] : "border-line text-muted"}`}>
                {r ? `${RS_ICON[r.status]} ${RSVP_LABEL[r.status]}` : "sem resposta"}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[11px] text-muted">Toca na resposta para a mudar tu (quando o jogador respondeu por WhatsApp ou não tem conta).</p>
    </div>
  );
}

