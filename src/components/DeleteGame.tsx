"use client";

import { ask } from "@/components/Dialog";
import { db, deleteGame } from "@/lib/db";
import type { Game } from "@/lib/types";
import { locale, t } from "@/lib/i18n";

/** Asks for confirmation (with what will be lost) and deletes the game. Returns true when deleted. */
export async function confirmDeleteGame(game: Game): Promise<boolean> {
  const n = await db.events.where("gameId").equals(game.id).count();
  const date = new Date(game.date + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  const lost = n
    ? (n === 1
      ? t("Vai ser apagado {n} evento, as notas de vídeo, o game plan, a rotação, a convocatória e o esforço registado neste jogo.", { n })
      : t("Vão ser apagados {n} eventos, as notas de vídeo, o game plan, a rotação, a convocatória e o esforço registado neste jogo.", { n }))
    : t("O jogo ainda não tem eventos. Também são apagados o game plan, a rotação e a convocatória.");
  const ok = await ask(
    `${t("Apagar o jogo {game} ({date})?", { game: `${game.home ? "vs" : "@"} ${game.opponent}`, date })}\n\n${lost}\n${t("As mensagens já enviadas aos jogadores ficam, sem ligação ao jogo.")}\n\n${t("Não dá para desfazer.")}`,
    { confirmText: t("Apagar jogo"), danger: true },
  );
  if (!ok) return false;
  await deleteGame(game.id);
  return true;
}

export function DeleteGameButton({ game, onDeleted, compact = false, className = "" }: { game: Game; onDeleted?: () => void; compact?: boolean; className?: string }) {
  return (
    <button type="button" className={`btn btn-danger ${className}`} aria-label={t("Apagar o jogo {game}", { game: `${game.home ? "vs" : "@"} ${game.opponent}` })}
      title={t("Apagar jogo")}
      onClick={async () => { if (await confirmDeleteGame(game)) onDeleted?.(); }}>
      {compact ? <TrashIcon /> : <><TrashIcon /> {t("Apagar jogo")}</>}
    </button>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block shrink-0 align-[-3px]">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
