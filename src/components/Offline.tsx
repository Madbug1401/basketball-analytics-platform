"use client";

import { useEffect, useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";

/* v0.11 — "new version available" (feedback ABC point 4: the PC kept showing an old version).
   Each deploy registers /sw.js?v=<build>; the new worker activates by itself (skipWaiting + clients.claim in
   public/sw.js), which fires `controllerchange` in pages that are already open. Those pages still run the old
   JavaScript, so we offer a reload. We also ask the browser to look for a new deploy when the tab comes back
   to the front and every 30 min, so a tab left open for days on the PC doesn't stay behind. */
let updateReady = false;
const updateListeners = new Set<() => void>();
const updateStore = {
  subscribe: (l: () => void) => { updateListeners.add(l); return () => { updateListeners.delete(l); }; },
  get: () => updateReady,
};

/** Registers the service worker that makes the app open without internet. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const url = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`;
    let reg: ServiceWorkerRegistration | undefined;
    const hadController = !!navigator.serviceWorker.controller; // first install: no "update" to announce
    const onChange = () => { if (hadController) { updateReady = true; updateListeners.forEach((l) => l()); } };
    const check = () => { if (document.visibilityState === "visible") reg?.update().catch(() => {}); };
    const register = () => navigator.serviceWorker.register(url).then((r) => { reg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    document.addEventListener("visibilitychange", check);
    const every = setInterval(check, 30 * 60 * 1000);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", check);
      clearInterval(every);
    };
  }, []);
  return null;
}

/** Bar shown when a new version of the app was installed in the background. */
export function UpdateBar() {
  const ready = useSyncExternalStore(updateStore.subscribe, updateStore.get, () => false);
  if (!ready) return null;
  return (
    <div className="flex items-center justify-center gap-3 border-b border-good/40 bg-good/10 px-3 py-1.5 text-xs text-good print:hidden" role="status">
      <span>{t("Há uma versão nova da app.")}</span>
      <button className="rounded-md border border-good/60 px-2 py-0.5 font-medium hover:bg-good/20" onClick={() => window.location.reload()}>{t("Atualizar agora")}</button>
    </div>
  );
}

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** Thin bar shown while there is no connection. */
export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="border-b border-brand/40 bg-brand/15 px-3 py-1.5 text-center text-xs text-brand print:hidden" role="status">
      {t("Sem internet — podes continuar a usar a app. Tudo fica guardado neste dispositivo e é enviado quando voltar a ligação.")}
    </div>
  );
}
