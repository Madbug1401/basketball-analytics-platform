"use client";

import { useSyncExternalStore } from "react";
import { LANGS, langStore, setLang, t, type Lang } from "@/lib/i18n";

/** Language of the whole interface (saved on this device). */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const lang = useSyncExternalStore(langStore.subscribe, langStore.get, langStore.server);
  if (compact) {
    return (
      <div className="flex justify-center gap-1" role="group" aria-label={t("Idioma")}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" onClick={() => setLang(l.id)} lang={l.id}
            className={`rounded-md px-2 py-1 text-xs ${lang === l.id ? "bg-panel-2 font-semibold text-fg" : "text-muted hover:text-fg"}`}
            aria-pressed={lang === l.id} title={l.label}>{l.flag}</button>
        ))}
      </div>
    );
  }
  return (
    <section className="card p-4">
      <h2 className="font-semibold">{t("Idioma")}</h2>
      <p className="mt-1 text-sm text-muted">{t("A língua de toda a aplicação neste dispositivo. Os dados (nomes, notas, mensagens) ficam como foram escritos.")}</p>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Idioma")}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} lang={l.id}
            onClick={() => setLang(l.id as Lang)}
            className={`btn flex-col gap-0.5 py-2 ${lang === l.id ? "btn-primary" : ""}`}>
            <span className="text-xs font-bold opacity-70">{l.flag}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
