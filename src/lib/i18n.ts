/* Interface language (pt / en / fr).
   Keys are the Portuguese source strings: t("Apagar jogo") → "Delete game" in English.
   Missing translations fall back to Portuguese, so nothing ever shows a raw key.
   Variables use {name}: t("{n} eventos", { n: 12 }).
   The Shell re-mounts the whole app when the language changes, so plain t() calls
   (in components and in lib code) always read the current language. */

import { DICT } from "@/i18n";

export type Lang = "pt" | "en" | "fr";
export const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "pt", label: "Português", flag: "PT" },
  { id: "en", label: "English", flag: "EN" },
  { id: "fr", label: "Français", flag: "FR" },
];

const KEY = "bap.lang";
const LOCALES: Record<Lang, string> = { pt: "pt-PT", en: "en-GB", fr: "fr-FR" };

function initial(): Lang {
  if (typeof window === "undefined") return "pt";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "pt" || saved === "en" || saved === "fr") return saved;
  } catch {}
  return "pt"; // Portuguese until someone picks another language (Definições → Idioma)
}

// Starts in Portuguese (the static HTML is prerendered in pt, so hydration matches);
// the Shell calls initLang() once mounted and the app re-renders in the saved language.
let current: Lang = "pt";
const listeners = new Set<() => void>();

export const getLang = () => current;
export const locale = () => LOCALES[current];

export function initLang() { setLang(initial(), false); }

/** Marks a string for translation without translating it yet (for constants defined at module
 *  level: translate them at render time with t(item.label)). */
export const L = (pt: string) => pt; // may carry a "|context" suffix: always display it through t()

export function setLang(l: Lang, save = true) {
  if (l === current) return;
  current = l;
  if (save) try { localStorage.setItem(KEY, l); } catch {}
  if (typeof document !== "undefined") document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export const langStore = {
  subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
  get: () => current,
  server: (): Lang => "pt",
};

type Vars = Record<string, string | number | undefined | null>;

export function t(pt: string, vars?: Vars): string {
  // "Falta|presença": the part after | only tells homonyms apart (attendance "absent" vs a foul);
  // Portuguese (and the fallback) shows the part before it
  let s = current === "pt" ? pt : (DICT[current][pt] ?? pt);
  const bar = s.indexOf("|");
  if (bar > 0) s = s.slice(0, bar);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
  return s;
}

/** Date helpers in the current language. */
export const fmtDate = (d: Date | string, o: Intl.DateTimeFormatOptions) =>
  (typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00" : d) : d).toLocaleDateString(locale(), o);
