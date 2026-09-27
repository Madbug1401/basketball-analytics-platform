"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAccess } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { t } from "@/lib/i18n";

/** Only staff (owner, coach, analyst) — and admin / local mode — can see the children. */
export function StaffOnly({ children }: { children: ReactNode }) {
  const { team } = useTeam();
  const a = useAccess(team?.id);
  if (a.canEdit) return <>{children}</>;
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="font-semibold">{t("Área da equipa técnica")}</h2>
      <p className="mt-1 text-sm text-muted">{t("Esta página só está disponível para treinadores e analistas.")}</p>
      <Link href="/" className="btn mt-4">{t("Voltar ao painel")}</Link>
    </div>
  );
}
