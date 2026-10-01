"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useSeason } from "@/lib/season";
import { BASE_DRILLS, suggestions } from "@/lib/planner";
import { FOCUS_LABEL, type Drill, type DrillFocus, type DrillMedia } from "@/lib/types";
import { MediaEditor, MediaStrip } from "@/components/DrillMedia";
import { deleteDrill, dropMediaFile } from "@/lib/media";
import { StaffOnly } from "@/components/Guard";
import { ask } from "@/components/Dialog";
import { t } from "@/lib/i18n";

const FOCI = Object.keys(FOCUS_LABEL) as DrillFocus[];

export default function DrillsGuarded() {
  return <StaffOnly><Drills /></StaffOnly>;
}

function Drills() {
  const { team } = useTeam();
  const s = useSeason(team?.id);
  const drills = useLiveQuery(() => (team ? db.drills.where("teamId").equals(team.id).sortBy("name") : []), [team?.id]);
  const [filter, setFilter] = useState<DrillFocus | "all">("all");
  const [editing, setEditing] = useState<Drill | "new" | null>(null);
  if (!team || !drills) return null;

  const sugg = s ? suggestions(s) : [];
  const shown = drills.filter((d) => filter === "all" || d.focus.includes(filter));
  const seed = async () => {
    const now = Date.now();
    await db.drills.bulkAdd(BASE_DRILLS.map((d, i) => ({ ...d, id: uid(), teamId: team.id, createdAt: now + i })));
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div>
        <Link href="/treinos" className="tap text-sm text-muted hover:text-fg">← {t("Treinos")}</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("Exercícios")}</h1>
            <p className="text-sm text-muted">{t("A biblioteca da equipa. Usa-a para montar o plano de cada treino.")}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing(editing ? null : "new")}>{editing ? t("Fechar") : t("+ Novo exercício")}</button>
        </div>
      </div>

      {sugg.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold">{t("A trabalhar, segundo os jogos")}</h2>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {sugg.map((x) => (
              <li key={x.focus} className="flex flex-wrap items-center gap-2">
                <button className="rounded-full border border-brand/50 px-2.5 py-1 text-xs text-brand hover:bg-brand/10" onClick={() => setFilter(x.focus)}>{t(FOCUS_LABEL[x.focus])}</button>
                <span className="text-muted">{x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && <DrillForm key={editing === "new" ? "new" : editing.id} teamId={team.id} initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}

      <div className="flex flex-wrap gap-1.5">
        <button className={`rounded-full border px-3 py-1 text-xs pointer-coarse:py-1.5 ${filter === "all" ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"}`} onClick={() => setFilter("all")}>{t("Todos ({n})", { n: drills.length })}</button>
        {FOCI.filter((f) => drills.some((d) => d.focus.includes(f))).map((f) => (
          <button key={f} className={`rounded-full border px-3 py-1 text-xs pointer-coarse:py-1.5 ${filter === f ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"}`} onClick={() => setFilter(f)}>{t(FOCUS_LABEL[f])}</button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((d) => (
          <div key={d.id} className="card flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-snug">{d.name}</h3>
              {d.minutes ? <span className="shrink-0 rounded bg-panel-2 px-2 py-0.5 font-mono text-xs">{d.minutes}′</span> : null}
            </div>
            <div className="flex flex-wrap gap-1">{d.focus.map((f) => <span key={f} className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">{t(FOCUS_LABEL[f])}</span>)}</div>
            {d.description && <p className="whitespace-pre-line text-sm text-muted">{d.description}</p>}
            <MediaStrip media={d.media} />
            <div className="mt-auto flex justify-end gap-3 pt-1 text-xs">
              <button className="tap -my-2 text-brand" onClick={() => { setEditing(d); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("Editar")}</button>
              <button className="tap -my-2 text-muted hover:text-bad" onClick={async () => { if (await ask(t("Apagar \"{name}\"?", { name: d.name }) + (d.media?.length ? `\n\n${t("Os anexos ({n}) também são apagados. Os planos de treino que já o usam mantêm o nome e os minutos.", { n: d.media.length })}` : ""), { confirmText: t("Apagar"), danger: true })) await deleteDrill(d); }}>{t("Apagar")}</button>
            </div>
          </div>
        ))}
      </div>
      {drills.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          <p>{t("Ainda sem exercícios.")}</p>
          <button className="btn btn-primary mt-3" onClick={seed}>{t("Adicionar {n} exercícios base", { n: BASE_DRILLS.length })}</button>
          <p className="mt-2 text-xs">{t("Podes editá-los e apagá-los depois.")}</p>
        </div>
      )}
    </div>
  );
}

function DrillForm({ teamId, initial, onDone }: { teamId: string; initial?: Drill; onDone: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? "", minutes: String(initial?.minutes ?? 10), description: initial?.description ?? "", focus: initial?.focus ?? [] as DrillFocus[] });
  // v0.11: the id exists before saving, so attached files get their final storage path (team/drill/file)
  const [id] = useState(() => initial?.id ?? uid());
  const [media, setMedia] = useState<DrillMedia[]>(initial?.media ?? []);
  const [err, setErr] = useState("");
  // files attached in this form (kept on the device right away by media.ts) and what got saved: when the form
  // goes away (Guardar, Cancelar, "Fechar" at the top, editing another drill…) unsaved files are forgotten
  const added = useRef<DrillMedia[]>([]);
  const savedIds = useRef<Set<string> | null>(null);
  useEffect(() => () => {
    const keep = savedIds.current ?? new Set((initial?.media ?? []).map((m) => m.id));
    for (const m of added.current) if (!keep.has(m.id)) void dropMediaFile(m);
  }, [initial]);
  const changeMedia = (next: DrillMedia[]) => {
    for (const m of next) if (!media.some((x) => x.id === m.id)) added.current.push(m);
    setMedia(next);
  };
  const toggle = (x: DrillFocus) => setF({ ...f, focus: f.focus.includes(x) ? f.focus.filter((y) => y !== x) : [...f.focus, x] });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr(t("Dá um nome ao exercício."));
    await db.drills.put({ id, teamId, name: f.name.trim(), minutes: Number(f.minutes) || undefined, description: f.description.trim() || undefined, focus: f.focus, media: media.length ? media : undefined, createdAt: initial?.createdAt ?? Date.now() });
    savedIds.current = new Set(media.map((m) => m.id));
    // files that were attached before and removed in this edit
    for (const m of initial?.media ?? []) if (!media.some((x) => x.id === m.id)) await dropMediaFile(m);
    onDone();
  };
  return (
    <form onSubmit={save} className="card grid gap-3 p-4">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div><label className="label">{t("Nome")}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">{t("Minutos")}</label><input className="input w-20" inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div>
      </div>
      <div>
        <label className="label">{t("Áreas")}</label>
        <div className="flex flex-wrap gap-1.5">
          {FOCI.map((x) => (
            <button type="button" key={x} onClick={() => toggle(x)} aria-pressed={f.focus.includes(x)}
              className={`rounded-full border px-2.5 py-1 text-xs pointer-coarse:py-1.5 ${f.focus.includes(x) ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"}`}>{t(FOCUS_LABEL[x])}</button>
          ))}
        </div>
      </div>
      <div><label className="label">{t("Descrição")}</label><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <MediaEditor teamId={teamId} drillId={id} value={media} onChange={changeMedia} />
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex gap-2"><button className="btn btn-primary flex-1">{t("Guardar")}</button><button type="button" className="btn" onClick={onDone}>{t("Cancelar")}</button></div>
    </form>
  );
}
