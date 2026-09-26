"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { TeamProvider, useTeam } from "@/lib/team";
import { AuthProvider, useAccess, useAuth, ROLE_LABEL } from "@/lib/auth";
import { db, importAll, uid } from "@/lib/db";
import { syncStore, syncNow } from "@/lib/sync";
import { AuthScreen, JoinWithCode } from "./AuthScreen";

type NavItem = { href: string; label: string; staff?: boolean };
const NAV: NavItem[] = [
  { href: "/", label: "Painel" },
  { href: "/equipa", label: "Plantel" },
  { href: "/treinos", label: "Treinos", staff: true },
  { href: "/jogos", label: "Jogos" },
  { href: "/adversarios", label: "Adversários" },
  { href: "/estatisticas", label: "Estatísticas" },
  { href: "/definicoes", label: "Definições" },
];

// pages that work without a selected team
const TEAMLESS = ["/admin", "/convite", "/conta"];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TeamProvider>
        <Inner>{children}</Inner>
      </TeamProvider>
    </AuthProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { mode, ready, session, profile } = useAuth();
  const { team, teams, loading, setTeamId } = useTeam();
  const access = useAccess(team?.id);
  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
  const compact = path.endsWith("/logger");
  const teamless = TEAMLESS.some((p) => path.startsWith(p));

  if (mode === "cloud" && !ready) return <Splash text="A iniciar…" />;
  if (mode === "cloud" && !session && !path.startsWith("/conta")) return <AuthScreen />;

  const firstLoad = mode === "cloud" && !sync.lastSync && sync.state === "syncing" && teams.length === 0;
  const nav = NAV.filter((n) => !n.staff || access.canEdit);

  let body: ReactNode;
  if (loading || firstLoad) body = <Splash text="A carregar os teus dados…" inline />;
  else if (team || teamless) body = children;
  else body = <Onboarding onCreated={setTeamId} />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur print:hidden">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${compact ? "" : "max-w-7xl"}`}>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Ball /> <span className="hidden sm:inline">Courtside</span>
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {team && nav.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
                  {n.label}
                </Link>
              );
            })}
            {profile?.isAdmin && (
              <Link href="/admin" className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${path.startsWith("/admin") ? "bg-panel-2 text-fg" : "text-brand hover:text-brand-2"}`}>
                Admin
              </Link>
            )}
          </nav>
          {teams.length > 0 && (
            <select className="input w-auto max-w-52 py-1.5" value={team?.id} onChange={(e) => setTeamId(e.target.value)} aria-label="Equipa">
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name} {t.category} {t.gender} · {t.season}</option>
              ))}
            </select>
          )}
          {mode === "cloud" && <SyncBadge />}
          {mode === "cloud" && <UserMenu role={team ? ROLE_LABEL[access.role] : undefined} />}
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-6 ${compact ? "py-3" : "max-w-7xl"}`}>{body}</main>
    </div>
  );
}

function Splash({ text, inline }: { text: string; inline?: boolean }) {
  return (
    <div className={`grid place-items-center text-muted ${inline ? "py-24" : "min-h-screen"}`}>
      <div className="flex items-center gap-3"><Ball spin /> {text}</div>
    </div>
  );
}

function SyncBadge() {
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
  const [open, setOpen] = useState(false);
  const dot = s.state === "error" ? "bg-bad" : s.state === "offline" ? "bg-brand" : s.pending > 0 || s.state === "syncing" ? "bg-opp animate-pulse" : "bg-good";
  const label = s.state === "offline" ? "Sem internet — guardado neste dispositivo"
    : s.state === "error" ? "Erro de sincronização"
    : s.state === "syncing" ? "A sincronizar…"
    : s.pending > 0 ? `${s.pending} alterações por enviar`
    : "Tudo guardado na cloud";
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-panel-2" onClick={() => setOpen(!open)} title={label}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="hidden lg:inline">{s.state === "offline" ? "Offline" : s.pending ? `${s.pending} por enviar` : "Sincronizado"}</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-10 z-40 w-72 p-3 text-sm shadow-xl">
          <div className="font-medium">{label}</div>
          {s.lastSync && <div className="mt-1 text-xs text-muted">Última sincronização: {new Date(s.lastSync).toLocaleTimeString("pt-PT")}</div>}
          {s.error && <div className="mt-2 text-xs text-bad">{s.error}</div>}
          <p className="mt-2 text-xs text-muted">Podes registar sem internet: as alterações ficam guardadas aqui e são enviadas quando voltar a ligação.</p>
          <button className="btn mt-2 w-full py-1 text-xs" onClick={() => void syncNow()}>Sincronizar agora</button>
        </div>
      )}
    </div>
  );
}

function UserMenu({ role }: { role?: string }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
  const initials = (profile?.fullName || profile?.email || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const out = async () => {
    if (s.pending > 0 && !confirm(`Há ${s.pending} alterações ainda não enviadas. Se saíres agora perdem-se. Sair mesmo assim?`)) return;
    await signOut();
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 text-xs font-semibold hover:bg-line" aria-label="Conta">
        {initials}
      </button>
      {open && (
        <div className="card absolute right-0 top-10 z-40 w-64 p-3 text-sm shadow-xl" onClick={() => setOpen(false)}>
          <div className="font-medium">{profile?.fullName || "Sem nome"}</div>
          <div className="truncate text-xs text-muted">{profile?.email}</div>
          {role && <div className="mt-1 text-xs text-brand">{role}</div>}
          {profile?.isAdmin && <div className="text-xs text-brand">Administrador da plataforma</div>}
          <div className="mt-3 grid gap-1">
            <Link href="/conta" className="btn btn-ghost justify-start py-1.5">A minha conta</Link>
            <Link href="/convite" className="btn btn-ghost justify-start py-1.5">Entrar noutra equipa (código)</Link>
            <button className="btn btn-ghost justify-start py-1.5 text-bad" onClick={out}>Terminar sessão</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Onboarding({ onCreated }: { onCreated: (id: string) => void }) {
  const { mode } = useAuth();
  return (
    <div className="mx-auto mt-6 grid max-w-3xl gap-6 md:grid-cols-2">
      <CreateTeam onCreated={onCreated} />
      {mode === "cloud" && (
        <div className="mt-10 md:mt-[4.5rem]">
          <div className="card p-5">
            <h2 className="font-semibold">Tens um código?</h2>
            <p className="mt-1 text-sm text-muted">Se és jogador ou treinador adjunto, pede o código ao dono da equipa e escreve-o aqui.</p>
            <JoinWithCode />
          </div>
        </div>
      )}
    </div>
  );
}

export function CreateTeam({ onCreated }: { onCreated: (id: string) => void }) {
  const { mode, markOwned } = useAuth();
  const [f, setF] = useState({ name: "ABC", category: "Sub-16", gender: "M" as "M" | "F", season: "2026/27" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    markOwned(id);
    await db.teams.add({ id, ...f, createdAt: Date.now() });
    onCreated(id);
  };
  return (
    <div className="mx-auto mt-10 w-full max-w-md">
      <h1 className="text-2xl font-semibold">Bem-vindo 👋</h1>
      <p className="mt-1 text-muted">Cria a tua equipa para começar. Ficas como dono/treinador principal.</p>
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
      <label className="mt-4 block cursor-pointer text-center text-sm text-muted hover:text-fg">
        …ou <span className="text-brand underline">importar uma cópia (.json)</span>
        <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            data.teams?.forEach((t: { id: string }) => markOwned(t.id));
            await importAll(data);
            if (data.teams?.[0]?.id) onCreated(data.teams[0].id);
          } catch (err) { alert(`Erro ao importar: ${(err as Error).message}`); }
        }} />
      </label>
      {mode === "cloud" && <p className="mt-2 text-center text-xs text-muted">A cópia importada é enviada para a tua conta.</p>}
    </div>
  );
}

export function Ball({ spin }: { spin?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-brand ${spin ? "animate-spin" : ""}`}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2v20M5 5c3 3 3 11 0 14M19 5c-3 3-3 11 0 14" />
    </svg>
  );
}
