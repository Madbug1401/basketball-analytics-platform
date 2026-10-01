"use client";

/*
 * Drill attachments UI (v0.11 — request from the ABC: "na biblioteca de exercícios, conseguir anexar uma imagem,
 * vídeo ou link do YouTube a cada exercício"). Storage and upload logic: src/lib/media.ts.
 *   MediaEditor  → inside the drill form (add link / photo / video, remove)
 *   MediaStrip   → thumbnails on a drill card, in the practice plan and in the live practice
 *   MediaViewer  → full-screen viewer (image, video, YouTube embed, external link)
 */

import { useEffect, useRef, useState } from "react";
import { MAX_VIDEO_MB, fmtSize, mediaFromFile, mediaFromUrl, useMediaSrc, youtubeOf } from "@/lib/media";
import type { DrillMedia } from "@/lib/types";
import { t } from "@/lib/i18n";

const ICON: Record<DrillMedia["kind"], string> = { youtube: "▶", link: "🔗", image: "🖼", video: "🎬" };

/** Small square preview (YouTube thumbnail, the image itself, or an icon). */
function Thumb({ m, size = "h-14 w-14" }: { m: DrillMedia; size?: string }) {
  const { src } = useMediaSrc(m);
  const yt = m.kind === "youtube" && m.url ? youtubeOf(m.url) : null;
  const img = yt ? `https://i.ytimg.com/vi/${yt}/default.jpg` : m.kind === "image" ? src : undefined;
  return (
    <span className={`relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-panel-2 text-lg`}>
      {img
        // eslint-disable-next-line @next/next/no-img-element -- blob: / signed URLs, next/image can't optimise them
        ? <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <span aria-hidden="true">{ICON[m.kind]}</span>}
      {m.kind === "youtube" && img && <span className="absolute inset-0 grid place-items-center bg-black/30 text-sm text-white" aria-hidden="true">▶</span>}
    </span>
  );
}

/** Thumbnails of a drill's attachments; tapping one opens the viewer. Renders nothing without attachments. */
export function MediaStrip({ media, compact = false }: { media?: DrillMedia[]; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media?.length) return null;
  return (
    <>
      {compact ? (
        <button type="button" className="tap shrink-0 rounded-md border border-line px-2 py-1 text-xs text-brand hover:bg-panel-2"
          onClick={() => setOpen(0)} title={t("Ver anexos")} aria-label={t("Ver anexos ({n})", { n: media.length })}>
          📎 {media.length}
        </button>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {media.map((m, i) => (
            <button key={m.id} type="button" onClick={() => setOpen(i)} title={m.title ?? m.url ?? ""} aria-label={t("Abrir {name}", { name: m.title ?? t("anexo") })}>
              <Thumb m={m} />
            </button>
          ))}
        </div>
      )}
      {open !== null && <MediaViewer media={media} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Body({ m }: { m: DrillMedia }) {
  const { src, error } = useMediaSrc(m);
  if (m.kind === "youtube") {
    const id = m.url ? youtubeOf(m.url) : null;
    return id
      ? (
        <div className="grid gap-2">
          <iframe className="aspect-video w-full rounded-lg" src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`} title={m.title ?? "YouTube"}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
          {/* some in-app browsers / networks block embeds: always offer the app/site too */}
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="tap w-fit text-xs text-brand">{t("Abrir no YouTube ↗")}</a>
        </div>
      )
      : <p className="text-sm text-muted">{m.url}</p>;
  }
  if (m.kind === "link") {
    return (
      <div className="grid gap-2 text-sm">
        <p className="break-all text-muted">{m.url}</p>
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-fit">{t("Abrir link ↗")}</a>
      </div>
    );
  }
  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!src) return <p className="text-sm text-muted">{t("A carregar…")}</p>;
  return m.kind === "image"
    // eslint-disable-next-line @next/next/no-img-element -- blob: / signed URLs
    ? <img src={src} alt={m.title ?? ""} className="max-h-[75vh] w-full rounded-lg object-contain" />
    : <video src={src} controls playsInline className="max-h-[75vh] w-full rounded-lg bg-black" />;
}

export function MediaViewer({ media, start, onClose }: { media: DrillMedia[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const m = media[Math.min(i, media.length - 1)];
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(media.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [media.length, onClose]);
  if (!m) return null;
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center overflow-y-auto bg-black/80 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("Anexos do exercício")}>
      <div className="card w-full max-w-3xl p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{ICON[m.kind]} {m.title ?? m.url ?? ""}</span>
          {media.length > 1 && <span className="text-xs text-muted">{i + 1}/{media.length}</span>}
          <button className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel-2" onClick={onClose} aria-label={t("Fechar")}>✕</button>
        </div>
        <Body key={m.id} m={m} />
        {media.length > 1 && (
          <div className="mt-2 flex justify-between">
            <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← {t("Anterior")}</button>
            <button className="btn" disabled={i === media.length - 1} onClick={() => setI(i + 1)}>{t("Seguinte")} →</button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Attachments inside the drill form. Files are kept on the device right away (media.ts → db.mediaFiles) and
 * reported through onChange; the form saves the list into drill.media (and forgets the files of a cancelled
 * form / removed attachments with dropMediaFile, see DrillForm in src/app/treinos/exercicios/page.tsx).
 */
export function MediaEditor({ teamId, drillId, value, onChange }: { teamId: string; drillId: string; value: DrillMedia[]; onChange: (next: DrillMedia[]) => void }) {
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const addLink = () => {
    const m = mediaFromUrl(link);
    if (!m) return setErr(t("Esse link não parece válido."));
    onChange([...value, m]);
    setLink("");
    setErr("");
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    const added: DrillMedia[] = [];
    for (const f of Array.from(files)) {
      try { added.push(await mediaFromFile(f, teamId, drillId)); } catch (e) { setErr((e as Error).message); }
    }
    onChange([...value, ...added]);
    setBusy(false);
  };

  return (
    <div>
      <label className="label">{t("Anexos (imagem, vídeo, YouTube ou link)")}</label>
      {value.length > 0 && (
        <ul className="mb-2 grid gap-1.5">
          {value.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-bg/40 p-1.5">
              <Thumb m={m} size="h-10 w-10" />
              <input className="input min-w-0 flex-1 px-2 py-1 text-sm" value={m.title ?? ""} placeholder={m.url ?? t("Título (opcional)")}
                aria-label={t("Título do anexo")} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value || undefined } : x)))} />
              {m.size ? <span className="hidden text-[11px] text-muted sm:inline">{fmtSize(m.size)}</span> : null}
              <button type="button" className="grid h-9 w-8 place-items-center text-muted hover:text-bad" aria-label={t("Tirar anexo")}
                onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" inputMode="url" placeholder={t("Colar link do YouTube ou outro…")} value={link}
          onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
        <button type="button" className="btn" onClick={addLink} disabled={!link.trim()}>{t("+ Link")}</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>{busy ? t("A preparar…") : t("+ Foto ou vídeo")}</button>
        <span className="text-[11px] text-muted">{t("Fotos reduzidas automaticamente · vídeos até {mb} MB (maiores: YouTube)", { mb: MAX_VIDEO_MB })}</span>
        <input ref={file} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
    </div>
  );
}
