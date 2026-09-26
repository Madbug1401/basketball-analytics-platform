"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { TeamProvider, useTeam } from "@/lib/team";
import { db, uid } from "@/lib/db";

const NAV = [
  { href: "/", label: "Painel" },
  { href: "/equipa", label: "Plantel" },
  { href: "/treinos", label: "Treinos" },
  { href: "/jogos", label: "Jogos" },
  { href: "/estatisticas", label: "Estatísticas" },
  { href: "/definicoes", label: "Definições" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <TeamProvider>
      <Inner>{children}</Inner>
    </TeamProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { team, teams, loading, setTeamId } = useTeam();
  const compact = path.endsWith("/logger");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center gap-4 px-4 ${compact ? "" : "max-w-7xl"}`}>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Ball /> <span>Courtside</span>
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          {teams.length > 0 && (
            <select
              className="input w-auto max-w-56 py-1.5"
              value={team?.id}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Equipa"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.category} {t.gender} · {t.season}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-6 ${compact ? "py-3" : "max-w-7xl"}`}>
        {loading ? null : team ? children : <CreateTeam onCreated={setTeamId} />}
      </main>
    </div>
  );
}

export function CreateTeam({ onCreated }: { onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: "ABC", category: "Sub-16", gender: "M" as "M" | "F", season: "2026/27" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    await db.teams.add({ id, ...f, createdAt: Date.now() });
    onCreated(id);
  };
  return (
    <div className="mx-auto mt-10 max-w-md">
      <h1 className="text-2xl font-semibold">Bem-vindo 👋</h1>
      <p className="mt-1 text-muted">Cria a tua equipa para começar. Podes adicionar outras equipas depois.</p>
      <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
        <div>
          <label className="label">Clube / equipa</label>
          <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Escalão</label>
            <input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </div>
          <div>
            <label className="label">Género</label>
            <select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as "M" | "F" })}>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div>
            <label className="label">Época</label>
            <input className="input" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary">Criar equipa</button>
      </form>
    </div>
  );
}

function Ball() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-brand">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2v20M5 5c3 3 3 11 0 14M19 5c-3 3-3 11 0 14" />
    </svg>
  );
}
