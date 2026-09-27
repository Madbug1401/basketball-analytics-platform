"use client";

import { useEffect, useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";

/** Registers the service worker that makes the app open without internet. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const url = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`;
    const register = () => navigator.serviceWorker.register(url).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
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
