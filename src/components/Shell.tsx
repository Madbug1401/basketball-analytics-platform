"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { TeamProvider, useTeam } from "@/lib/team";
import { AuthProvider, useAccess, useAuth, ROLE_LABEL } from "@/lib/auth";
import { db, importIntoTeam, uid } from "@/lib/db";
import { syncStore, syncNow } from "@/lib/sync";
import { AuthScreen, JoinWithCode } from "./AuthScreen";
import { OfflineBar, ServiceWorker } from "./Offline";
import { ask, notify, DialogHost } from "@/components/Dialog";

type NavItem = { href: string; label: string; staff?: boolean };
const NAV: NavItem[] = [
  { href: "/", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/equipa", label: "Plantel" },
  { href: "/treinos", label: "Treinos", staff: true },
  { href: "/carga", label: "Carga", staff: true },
  { href: "/fisico", label: "Físico", staff: true },
  { href: "/jogos", label: "Jogos" },
  { href: "/adversarios", label: "Adversários" },
  { href: "/estatisticas", label: "Estatísticas" },
  { href: "/objetivos", label: "Objetivos" },
  { href: "/definicoes", label: "Definições" },
];

// pages that work without a selected team
const TEAMLESS = ["/admin", "/convite", "/conta"];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TeamProvider>
        <Inner>{children}</Inner>
        <DialogHost />
        <ServiceWorker />
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
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const open = () => setCreating(true);
    window.addEventListener("courtside:new-team", open);
    return () => window.removeEventListener("courtside:new-team", open);
  }, []);
  const [menuPath, setMenuPath] = useState(path);
  if (menuPath !== path) { setMenuPath(path); if (menu) setMenu(false); }
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [menu]);

  if (mode === "cloud" && !ready) return <Splash text="A iniciar…" />;
  if (mode === "cloud" && !session && !path.startsWith("/conta")) return <AuthScreen />;

  const firstLoad = mode === "cloud" && !sync.lastSync && sync.state === "syncing" && teams.length === 0;
  const nav = NAV.filter((n) => !n.staff || access.canEdit);

  let body: ReactNode;
  if (loading || firstLoad) body = <Splash text="A carregar os teus dados…" inline />;
  else if (team || teamless) body = children;
  else body = <Onboarding onCreated={setTeamId} />;

  const links = [
    ...(team ? nav : []),
    ...(profile?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const teamSelect = (cls: string) =>
    teams.length > 0 && (
      <select className={`input py-1.5 ${cls}`} value={team?.id} aria-label="Equipa"
        onChange={(e) => { if (e.target.value === NEW_TEAM) { setMenu(false); setCreating(true); } else setTeamId(e.target.value); }}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name} {t.category} {t.gender} · {t.season}</option>
        ))}
        <option value={NEW_TEAM}>+ Nova equipa…</option>
      </select>
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur print:hidden">
        <div className={`mx-auto flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 ${compact ? "" : "max-w-7xl"}`}>
          {links.length > 0 && (
            <button className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-fg lg:hidden"
              onClick={() => setMenu(true)} aria-label="Abrir menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          )}
          <Link href="/" className="flex h-9 min-w-9 items-center gap-2 font-semibold tracking-tight">
            <Ball /> <span className="hidden sm:inline">Courtside</span>
          </Link>
          {team && <span className="min-w-0 flex-1 truncate text-sm text-muted lg:hidden">{team.name} {team.category}</span>}
          <nav className="hidden flex-1 gap-1 overflow-x-auto lg:flex">
            {links.map((n) => (
              <Link key={n.href} href={n.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${isActive(n.href) ? "bg-panel-2 text-fg" : n.href === "/admin" ? "text-brand hover:text-brand-2" : "text-muted hover:text-fg"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          {!team && <span className="flex-1" />}
          {teamSelect("hidden w-auto max-w-64 lg:block")}
          {mode === "cloud" && <SyncBadge />}
          {mode === "cloud" && <UserMenu role={team ? ROLE_LABEL[access.role] : undefined} />}
        </div>
        <OfflineBar />
      </header>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/60" onClick={() => setMenu(false)} aria-label="Fechar menu" />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col gap-4 overflow-y-auto border-r border-line bg-bg p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold"><Ball /> Courtside</span>
              <button className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel-2" onClick={() => setMenu(false)} aria-label="Fechar">✕</button>
            </div>
            {teams.length > 0 && (
              <div>
                <label className="label">Equipa</label>
                {teamSelect("w-full")}
              </div>
            )}
            <nav className="grid gap-1">
              {links.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMenu(false)}
                  className={`rounded-lg px-3 py-3 text-base ${isActive(n.href) ? "bg-panel-2 font-medium text-fg" : n.href === "/admin" ? "text-brand" : "text-muted hover:bg-panel-2 hover:text-fg"}`}>
                  {n.label}
                </Link>
              ))}
            </nav>
            {team && mode === "cloud" && <p className="mt-auto text-xs text-muted">O teu papel: {ROLE_LABEL[access.role]}</p>}
          </aside>
        </div>
      )}

      <main className={`mx-auto w-full min-w-0 flex-1 px-3 py-5 sm:px-4 sm:py-6 ${compact ? "py-3" : "max-w-7xl"}`}>{body}</main>
      {creating && <NewTeamDialog onClose={() => setCreating(false)} onCreated={(id) => { setTeamId(id); setCreating(false); }} />}
    </div>
  );
}

const NEW_TEAM = "__new_team";
/** Other components (settings, account menu) open the "new team" dialog through this event. */
export const openNewTeam = () => window.dispatchEvent(new Event("courtside:new-team"));

/** Create another team (another age group, the women's team, next season…) without leaving the page. */
function NewTeamDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Nova equipa">
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CreateTeam onCreated={onCreated} onCancel={onClose} />
      </div>
    </div>
  );
}

/** Close a popover when tapping outside it or pressing Escape. */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close, ref]);
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
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const dot = s.state === "error" ? "bg-bad" : s.state === "offline" ? "bg-brand" : s.pending > 0 || s.state === "syncing" ? "bg-opp animate-pulse" : "bg-good";
  const label = s.state === "offline" ? "Sem internet — guardado neste dispositivo"
    : s.state === "error" ? "Erro de sincronização"
    : s.state === "syncing" ? "A sincronizar…"
    : s.pending > 0 ? `${s.pending} alterações por enviar`
    : "Tudo guardado na cloud";
  return (
    <div className="relative" ref={ref}>
      <button className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-md px-2 text-xs text-muted hover:bg-panel-2" onClick={() => setOpen(!open)} title={label}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="hidden lg:inline">{s.state === "offline" ? "Offline" : s.pending ? `${s.pending} por enviar` : "Sincronizado"}</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-40 w-[min(18rem,calc(100vw-1.5rem))] p-3 text-sm shadow-xl">
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
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
  const initials = (profile?.fullName || profile?.email || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const out = async () => {
    if (s.pending > 0 && !(await ask(`Há ${s.pending} alterações ainda não enviadas. Se saíres agora perdem-se. Sair mesmo assim?`, { confirmText: "Sair", danger: true }))) return;
    await signOut();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-full bg-panel-2 text-xs font-semibold hover:bg-line" aria-label="Conta">
        {initials}
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-40 w-[min(16rem,calc(100vw-1.5rem))] p-3 text-sm shadow-xl" onClick={() => setOpen(false)}>
          <div className="font-medium">{profile?.fullName || "Sem nome"}</div>
          <div className="truncate text-xs text-muted">{profile?.email}</div>
          {role && <div className="mt-1 text-xs text-brand">{role}</div>}
          {profile?.isAdmin && <div className="text-xs text-brand">Administrador da plataforma</div>}
          <div className="mt-3 grid gap-1">
            <Link href="/conta" className="btn btn-ghost justify-start py-1.5">A minha conta</Link>
            <button className="btn btn-ghost justify-start py-1.5" onClick={openNewTeam}>+ Criar nova equipa</button>
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

export function CreateTeam({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel?: () => void }) {
  const { mode, markOwned } = useAuth();
  const { team } = useTeam();
  // another team of the same club: keep the club name and season, the age group changes
  const [f, setF] = useState({ name: team?.name ?? "ABC", category: team ? "" : "Sub-16", gender: (team?.gender ?? "M") as "M" | "F", season: team?.season ?? "2026/27" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid();
    markOwned(id);
    await db.teams.add({ id, ...f, createdAt: Date.now() });
    onCreated(id);
  };
  return (
    <div className={`mx-auto w-full max-w-md ${onCancel ? "" : "mt-10"}`}>
      {onCancel ? null : <>
        <h1 className="text-2xl font-semibold">Bem-vindo 👋</h1>
        <p className="mt-1 text-muted">Cria a tua equipa para começar. Ficas como dono/treinador principal.</p>
      </>}
      <form onSubmit={submit} className={`card grid gap-4 p-5 ${onCancel ? "" : "mt-6"}`}>
        {onCancel && (
          <div>
            <h2 className="text-lg font-semibold">Nova equipa</h2>
            <p className="text-sm text-muted">Outro escalão, a equipa feminina ou a próxima época. Cada equipa tem o seu plantel, treinos e jogos; ficas como dono.</p>
          </div>
        )}
        <div>
          <label className="label">Clube / equipa</label>
          <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Escalão</label>
            <input className="input" required placeholder="Sub-18" autoFocus={!!onCancel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
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
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1">Criar equipa</button>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancelar</button>}
        </div>
      </form>
      {!onCancel && <label className="mt-4 block cursor-pointer text-center text-sm text-muted hover:text-fg">
        …ou <span className="text-brand underline">importar uma cópia (.json)</span>
        <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            // a new team (own ids) is created from the file, so it never clashes with earlier imports
            const { teamId } = await importIntoTeam(data, team ?? null);
            markOwned(teamId);
            onCreated(teamId);
          } catch (err) { void notify(`Erro ao importar: ${(err as Error).message}`); }
        }} />
      </label>}
      {mode === "cloud" && !onCancel && <p className="mt-2 text-center text-xs text-muted">A cópia importada é enviada para a tua conta.</p>}
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
