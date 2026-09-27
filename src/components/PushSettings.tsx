"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { cloudConfigured } from "@/lib/supabase";
import { L, t } from "@/lib/i18n";

const text: Record<PushState, string> = {
  unsupported: L("Este browser não suporta notificações."),
  "ios-install": L("No iPhone, primeiro adiciona a app ao ecrã principal (Partilhar → Adicionar ao ecrã principal) e abre-a a partir daí."),
  denied: L("As notificações estão bloqueadas. Ativa-as nas definições do browser/telemóvel para este site."),
  off: L("Recebe um aviso quando há convocatória, mensagem do treinador ou game plan."),
  on: L("Ativas neste dispositivo."),
};

function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { let alive = true; void pushState().then((s) => { if (alive) setState(s); }); return () => { alive = false; }; }, []);
  return [state, setState] as const;
}

/** Full control (account page). */
export function PushSettings() {
  const [state, setState] = usePush();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!cloudConfigured || !state) return null;
  const toggle = async () => {
    setBusy(true); setErr("");
    try { setState(state === "on" ? await disablePush() : await enablePush()); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="card grid gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{t("Notificações")}</div>
          <p className="text-sm text-muted">{t(text[state])}</p>
        </div>
        {(state === "on" || state === "off") && (
          <button className={`btn shrink-0 ${state === "on" ? "" : "btn-primary"}`} onClick={toggle} disabled={busy}>
            {busy ? "…" : state === "on" ? t("Desativar") : t("Ativar")}
          </button>
        )}
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}

const DISMISS = "bap.pushPrompt";

/** Small invitation on the dashboard while notifications are off on this device. */
export function PushPrompt() {
  const [state, setState] = usePush();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS) === "1"; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  if (!cloudConfigured || hidden || (state !== "off" && state !== "ios-install")) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(DISMISS, "1"); } catch {} };
  return (
    <div className="card flex flex-wrap items-center gap-3 border-brand/50 p-3 text-sm">
      <span className="text-xl" aria-hidden>🔔</span>
      <p className="min-w-0 flex-1">{state === "off" ? t("Ativa as notificações para saberes logo das convocatórias e mensagens.") : t(text["ios-install"])}</p>
      <div className="flex gap-2">
        {state === "off" && (
          <button className="btn btn-primary" disabled={busy}
            onClick={async () => { setBusy(true); try { setState(await enablePush()); } catch { /* shown on the account page */ } finally { setBusy(false); } }}>
            {t("Ativar")}
          </button>
        )}
        <Link href="/conta" className="btn hidden sm:inline-flex">{t("Mais")}</Link>
        <button className="btn px-2" onClick={close} aria-label={t("Agora não")}>✕</button>
      </div>
    </div>
  );
}
