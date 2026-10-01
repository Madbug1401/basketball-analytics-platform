"use client";

import { ask } from "@/components/Dialog";
import { db, deletePractice } from "@/lib/db";
import type { Practice } from "@/lib/types";
import { locale, t } from "@/lib/i18n";

/**
 * Asks for confirmation — saying exactly what will be lost — and deletes the practice. Returns true when deleted.
 * v0.11 (feedback ABC point 2): before, practices only asked "Apagar este treino?". Same pattern as
 * confirmDeleteGame in DeleteGame.tsx; what is deleted is in db.ts deletePractice.
 */
export async function confirmDeletePractice(practice: Practice): Promise<boolean> {
  const [attendance, info, rsvps, wellness, run] = await Promise.all([
    db.attendance.where("practiceId").equals(practice.id).count(),
    db.agenda.get(practice.id),
    db.rsvps.where("refId").equals(practice.id).count(),
    db.wellness.filter((w) => w.refId === practice.id).count(),
    db.practice_runs.get(practice.id),
  ]);
  const plan = info?.plan?.length ?? 0;
  const lost = [
    attendance && t("{n} presenças", { n: attendance }),
    plan && t("o plano ({n} exercícios)", { n: plan }),
    run && t("o registo do treino ao vivo"),
    rsvps && t("{n} respostas dos jogadores", { n: rsvps }),
    wellness && t("{n} registos de esforço", { n: wellness }),
  ].filter(Boolean) as string[];
  const date = new Date(practice.date + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  const ok = await ask(
    `${t("Apagar o treino “{title}” ({date})?", { title: practice.title || t("Treino"), date })}\n\n` +
    (lost.length ? t("Também é apagado: {list}.", { list: lost.join(", ") }) : t("Este treino ainda não tem presenças, plano nem respostas.")) +
    `\n${t("Os exercícios da biblioteca ficam.")}\n\n${t("Não dá para desfazer.")}`,
    { confirmText: t("Apagar treino"), danger: true },
  );
  if (!ok) return false;
  await deletePractice(practice.id);
  return true;
}
