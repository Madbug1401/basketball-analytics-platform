"use client";

import { PLAY_TAGS, type PlayTag } from "@/lib/types";
import { t } from "@/lib/i18n";

/** Chips to mark the context of a play (transition, pick & roll…). Several can be on. */
export function TagPicker({ value, onToggle, compact }: { value: PlayTag[]; onToggle: (tag: PlayTag) => void; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
      {PLAY_TAGS.map((tg) => {
        const on = value.includes(tg.id);
        return (
          <button key={tg.id} type="button" title={t(tg.label)} aria-pressed={on} onClick={() => onToggle(tg.id)}
            className={`rounded-full border text-xs ${compact ? "px-2 py-0.5 pointer-coarse:px-2.5 pointer-coarse:py-1.5" : "px-2.5 py-1 pointer-coarse:py-1.5"} ${on ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {t(tg.short)}
          </button>
        );
      })}
    </div>
  );
}

export const toggleTag = (tags: PlayTag[] | undefined, tag: PlayTag) =>
  (tags ?? []).includes(tag) ? (tags ?? []).filter((x) => x !== tag) : [...(tags ?? []), tag];
