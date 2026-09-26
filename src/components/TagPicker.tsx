"use client";

import { PLAY_TAGS, type PlayTag } from "@/lib/types";

/** Chips to mark the context of a play (transition, pick & roll…). Several can be on. */
export function TagPicker({ value, onToggle, compact }: { value: PlayTag[]; onToggle: (t: PlayTag) => void; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
      {PLAY_TAGS.map((t) => {
        const on = value.includes(t.id);
        return (
          <button key={t.id} type="button" title={t.label} aria-pressed={on} onClick={() => onToggle(t.id)}
            className={`rounded-full border text-xs ${compact ? "px-2 py-0.5 pointer-coarse:px-2.5 pointer-coarse:py-1.5" : "px-2.5 py-1 pointer-coarse:py-1.5"} ${on ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {t.short}
          </button>
        );
      })}
    </div>
  );
}

export const toggleTag = (tags: PlayTag[] | undefined, t: PlayTag) =>
  (tags ?? []).includes(t) ? (tags ?? []).filter((x) => x !== t) : [...(tags ?? []), t];
