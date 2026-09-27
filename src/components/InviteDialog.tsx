"use client";

import { useEffect, useState } from "react";
import { createInvite, inviteLink } from "@/lib/members";
import { t } from "@/lib/i18n";

export function InviteDialog({
  teamId, teamName, role, playerId, who, onClose,
}: {
  teamId: string; teamName: string; role: "player" | "coach" | "analyst"; playerId?: string; who: string; onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    createInvite(teamId, role, playerId).then((c) => alive && setCode(c)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [teamId, role, playerId]);

  const link = code ? inviteLink(code) : "";
  const text = t("Olá {who}! Entra na equipa {team} no Courtside: {link} (código {code})", { who, team: teamName, link, code });
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">{t("Convidar {who}", { who })}</h3>
        <p className="mt-1 text-sm text-muted">
          {role === "player" ? t("O jogador cria conta e usa este código para ficar ligado à sua ficha.") : role === "coach" ? t("A pessoa cria conta e usa este código para entrar como treinador.") : t("A pessoa cria conta e usa este código para entrar como analista.")}
        </p>
        {err && <p className="mt-3 text-sm text-bad">{err}</p>}
        {!code && !err && <p className="mt-4 text-center text-muted">{t("A gerar código…")}</p>}
        {code && (
          <>
            <div className="mt-4 rounded-lg border border-line bg-bg py-3 text-center font-mono text-3xl font-bold tracking-[0.3em]">{code}</div>
            <p className="mt-2 break-all text-center text-xs text-muted">{link}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn" onClick={copy}>{copied ? t("Copiado ✓") : t("Copiar mensagem")}</button>
              <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
            <p className="mt-3 text-[11px] text-muted">{t("Válido 30 dias e só pode ser usado uma vez.")}</p>
          </>
        )}
        <button className="btn mt-4 w-full" onClick={onClose}>{t("Fechar")}</button>
      </div>
    </div>
  );
}
