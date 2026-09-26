"use client";

import { useEffect, useState } from "react";
import { renderCard, summaryText, type CardData } from "@/lib/shareCard";

/** Preview + share the game card as an image (WhatsApp, Instagram…) or as text. */
export function ShareDialog({ data, onClose }: { data: Omit<CardData, "includeBox">; onClose: () => void }) {
  const [includeBox, setIncludeBox] = useState(true);
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const d = { ...data, includeBox };
  const text = summaryText(d);
  const fileName = `${data.team.name}-${data.game.opponent}-${data.game.date}.png`.replace(/[^\w.-]+/g, "_");

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    renderCard({ ...data, includeBox })
      .then((blob) => { if (cancelled) return; url = URL.createObjectURL(blob); setImg({ url, blob }); })
      .catch((e: Error) => setErr(e.message));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [data, includeBox]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);

  const file = img ? new File([img.blob], fileName, { type: "image/png" }) : null;
  const canShareFile = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  const share = async () => {
    if (!file) return;
    try { await navigator.share({ files: [file], text }); }
    catch (e) { if ((e as Error).name !== "AbortError") setErr("Não foi possível partilhar. Descarrega a imagem."); }
  };
  const download = () => {
    if (!img) return;
    const a = document.createElement("a");
    a.href = img.url; a.download = fileName; a.click();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("Texto copiado ✓"); }
    catch { setMsg("Não deu para copiar — seleciona o texto abaixo."); }
    setTimeout(() => setMsg(""), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Partilhar jogo">
      <div className="card mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_260px]" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-lg border border-line bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            {img ? <img src={img.url} alt="Resumo do jogo" className="h-full w-full object-contain" /> : <span className="text-sm text-muted">{err || "A gerar imagem…"}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Partilhar</h2>
            <button className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel-2" onClick={onClose} aria-label="Fechar">✕</button>
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4" checked={includeBox} onChange={(e) => setIncludeBox(e.target.checked)} /> Incluir box score dos jogadores
          </label>
          {canShareFile && <button className="btn btn-primary" onClick={share}>Partilhar imagem…</button>}
          <button className={`btn ${canShareFile ? "" : "btn-primary"}`} onClick={download} disabled={!img}>Descarregar imagem</button>
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Enviar resumo no WhatsApp</a>
          <button className="btn" onClick={copy}>Copiar resumo em texto</button>
          {msg && <p className="text-xs text-good">{msg}</p>}
          {err && img && <p className="text-xs text-bad">{err}</p>}
          <textarea readOnly className="input mt-1 min-h-32 flex-1 font-mono text-xs" value={text} aria-label="Resumo em texto" />
          <p className="text-[11px] text-muted">São jogadores menores: partilha só em grupos da equipa e com autorização dos pais.</p>
        </div>
      </div>
    </div>
  );
}
