"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDismiss } from "@/lib/useDismiss";

export type RowAction =
  | { label: string; href: string; danger?: boolean }
  | { label: string; onClick: () => void | Promise<unknown>; danger?: boolean };

/**
 * "⋯" menu on a list row/card with its actions (Editar, Eliminar…) — v0.11, feedback ABC point 2:
 * edit or delete a game / practice / agenda entry without opening it first, also on the phone.
 * The menu is `position: fixed` (placed under the button) so cards with `overflow-hidden` don't clip it;
 * it closes on scroll/resize, outside tap or Escape. Deleting always goes through a confirmation that
 * says what is lost (DeleteGame.tsx / DeletePractice.tsx), never from here directly.
 */
/** Labels come already translated from the caller. */
export function RowActions({ actions, label, className = "" }: { actions: RowAction[]; label: string; className?: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setPos(null), []);
  useDismiss(!!pos, close, box);
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", close, true); // a fixed menu would float away from its row
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos, close]);

  const toggle = () => {
    if (pos) return close();
    const r = btn.current!.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    const room = 48 * actions.length + 16; // menu height, roughly
    // near the bottom of the screen the menu opens upwards
    setPos(r.bottom + room > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };

  const item = "block w-full rounded-md px-3 py-2.5 text-left text-sm hover:bg-panel-2 pointer-coarse:py-3";
  return (
    <div ref={box} className={`relative shrink-0 ${className}`}>
      <button ref={btn} type="button" className="grid h-9 w-9 place-items-center rounded-md text-lg leading-none text-muted hover:bg-panel-2 hover:text-fg"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }} aria-haspopup="menu" aria-expanded={!!pos} aria-label={label} title={label}>
        ⋯
      </button>
      {pos && (
        <div role="menu" className="card fixed z-50 min-w-44 p-1 shadow-xl" style={pos}>
          {actions.map((a) => "href" in a
            ? <Link key={a.label} href={a.href} role="menuitem" className={`${item} ${a.danger ? "text-bad" : ""}`} onClick={close}>{a.label}</Link>
            : <button key={a.label} type="button" role="menuitem" className={`${item} ${a.danger ? "text-bad" : ""}`}
                onClick={(e) => { e.stopPropagation(); close(); void a.onClick(); }}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
}
