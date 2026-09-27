"use client";

// Promise-based confirm/prompt that replace window.confirm/prompt.
// Native dialogs are blocked or behave badly in some mobile browsers and in-app webviews
// (links opened from WhatsApp/Instagram, installed PWA), which made delete buttons look "dead".

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";

type Req = {
  kind: "confirm" | "prompt";
  message: string;
  confirmText: string;
  danger: boolean;
  expected?: string; // prompt: the value that must be typed to enable the confirm button
  resolve: (v: string | null) => void;
};

let current: Req | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const store = {
  subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
  get: () => current,
};

function open(r: Omit<Req, "resolve">) {
  return new Promise<string | null>((resolve) => {
    current?.resolve(null);
    current = { ...r, resolve };
    emit();
  });
}

export async function ask(message: string, opts: { confirmText?: string; danger?: boolean } = {}) {
  const v = await open({ kind: "confirm", message, confirmText: opts.confirmText ?? t("Confirmar"), danger: opts.danger ?? false });
  return v !== null;
}

export function askText(message: string, opts: { confirmText?: string; danger?: boolean; expected?: string } = {}) {
  return open({ kind: "prompt", message, confirmText: opts.confirmText ?? t("Confirmar"), danger: opts.danger ?? false, expected: opts.expected });
}

export function notify(message: string) {
  return open({ kind: "confirm", message, confirmText: "OK", danger: false }).then(() => undefined);
}

export function DialogHost() {
  const req = useSyncExternalStore(store.subscribe, store.get, () => null);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const close = (v: string | null) => {
    if (!req) return;
    current = null;
    emit();
    setText("");
    req.resolve(v);
  };

  useEffect(() => {
    if (!req) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    window.addEventListener("keydown", h, true);
    if (req.kind === "prompt") setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener("keydown", h, true);
  });

  if (!req) return null;
  const blocked = req.kind === "prompt" && req.expected !== undefined && text.trim() !== req.expected.trim();
  const isNotice = req.confirmText === "OK" && req.kind === "confirm";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={() => close(null)} role="dialog" aria-modal="true">
      <form className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (!blocked) close(req.kind === "prompt" ? text : ""); }}>
        <p className="whitespace-pre-line text-sm">{req.message}</p>
        {req.kind === "prompt" && (
          <input ref={inputRef} className="input mt-3" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={req.expected} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        )}
        <div className="mt-4 flex gap-2">
          {!isNotice && <button type="button" className="btn flex-1" onClick={() => close(null)}>{t("Cancelar")}</button>}
          <button type="submit" disabled={blocked}
            className={`btn flex-1 ${req.danger ? "border-bad bg-bad text-black hover:bg-bad/90" : "btn-primary"}`}>
            {req.confirmText}
          </button>
        </div>
      </form>
    </div>
  );
}
