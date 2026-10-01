"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { TeamProvider, useTeam } from "@/lib/team";
import { AuthProvider, useAccess, useAuth, ROLE_LABEL } from "@/lib/auth";
import { db, importIntoTeam, uid } from "@/lib/db";
import { syncStore, syncNow } from "@/lib/sync";
import { AuthScreen, JoinWithCode } from "./AuthScreen";
import { OfflineBar, ServiceWorker, UpdateBar } from "./Offline";
import { LanguagePicker } from "./LanguagePicker";
import { ask, notify, DialogHost } from "@/components/Dialog";
import { initLang, L, langStore, locale, t } from "@/lib/i18n";
import { versionLabel } from "@/lib/version";
import { useDismiss } from "@/lib/useDismiss";

type NavItem = { href: string; label: string; staff?: boolean };
const NAV: NavItem[] = [
  { href: "/", label: L("Painel") },
  { href: "/agenda", label: L("Agenda") },
  { href: "/equipa", label: L("Plantel") },
  { href: "/treinos", label: L("Treinos"), staff: true },
  { href: "/carga", label: L("Carga"), staff: true },
  { href: "/fisico", label: L("Físico"), staff: true },
  { href: "/jogos", label: L("Jogos") },
  { href: "/adversarios", label: L("Adversários") },
  { href: "/estatisticas", label: L("Estatísticas") },
  { href: "/objetivos", label: L("Objetivos") },
  { href: "/definicoes", label: L("Definições") },
];

// pages that work without a selected team
const TEAMLESS = ["/admin", "/convite", "/conta"];

export function Shell({ children }: { children: ReactNode }) {
  // changing the language re-mounts the app, so every t() reads the new language
  const lang = useSyncExternalStore(langStore.subscribe, langStore.get, langStore.server);
  useEffect(() => { initLang(); }, []);
  return (
    <AuthProvider>
      <TeamProvider>
        <Inner key={lang}>{children}</Inner>
        <DialogHost key={`d-${lang}`} />
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

  if (mode === "cloud" && !ready) return <Splash text={t("A iniciar…")} />;
  if (mode === "cloud" && !session && !path.startsWith("/conta")) return <AuthScreen />;

  const firstLoad = mode === "cloud" && !sync.lastSync && sync.state === "syncing" && teams.length === 0;
  const nav = NAV.filter((n) => !n.staff || access.canEdit);

  let body: ReactNode;
  if (loading || firstLoad) body = <Splash text={t("A carregar os teus dados…")} inline />;
  else if (team || teamless) body = children;
  else body = <Onboarding onCreated={setTeamId} />;

  const links = [
    ...(team ? nav : []),
    ...(profile?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const teamSelect = (cls: string) =>
    teams.length > 0 && (
      <select className={`input py-1.5 ${cls}`} value={team?.id} aria-label={t("Equipa")}
        onChange={(e) => { if (e.target.value === NEW_TEAM) { setMenu(false); setCreating(true); } else setTeamId(e.target.value); }}>
        {teams.map((tm) => (
          <option key={tm.id} value={tm.id}>{tm.name} {tm.category} {tm.gender} · {tm.season}</option>
        ))}
        <option value={NEW_TEAM}>{t("+ Nova equipa…")}</option>
      </select>
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur print:hidden">
        <div className={`mx-auto flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 ${compact ? "" : "max-w-7xl"}`}>
          {links.length > 0 && (
            <button className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-fg lg:hidden"
              onClick={() => setMenu(true)} aria-label={t("Abrir menu")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          )}
          <Link href="/" className="flex h-9 min-w-9 items-center gap-2 font-semibold tracking-tight">
            <Ball /> <span className="hidden sm:inline">Courtside</span>
          </Link>
          {team && <span className="min-w-0 flex-1 truncate text-sm text-muted lg:hidden">{team.name} {team.category}</span>}
          <DesktopNav links={links} isActive={isActive} />
          {!team && <span className="flex-1" />}
          {teamSelect("hidden w-auto max-w-48 lg:block xl:max-w-64")}
          {mode === "cloud" && <SyncBadge />}
          {mode === "cloud" && <UserMenu role={team ? t(ROLE_LABEL[access.role]) : undefined} />}
        </div>
        <OfflineBar />
        <UpdateBar />
        {mode === "cloud" && access.canEdit && <MissingOnServerBar />}
      </header>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/60" onClick={() => setMenu(false)} aria-label={t("Fechar menu")} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col gap-4 overflow-y-auto border-r border-line bg-bg p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold"><Ball /> Courtside</span>
              <button className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel-2" onClick={() => setMenu(false)} aria-label={t("Fechar")}>✕</button>
            </div>
            {teams.length > 0 && (
              <div>
                <label className="label">{t("Equipa")}</label>
                {teamSelect("w-full")}
              </div>
            )}
            <nav className="grid gap-1">
              {links.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMenu(false)}
                  className={`rounded-lg px-3 py-3 text-base ${isActive(n.href) ? "bg-panel-2 font-medium text-fg" : n.href === "/admin" ? "text-brand" : "text-muted hover:bg-panel-2 hover:text-fg"}`}>
                  {t(n.label)}
                </Link>
              ))}
            </nav>
            {team && mode === "cloud" && <p className="mt-auto text-xs text-muted">{t("O teu papel: {role}", { role: t(ROLE_LABEL[access.role]) })}</p>}
          </aside>
        </div>
      )}

      <main className={`mx-auto w-full min-w-0 flex-1 px-3 py-5 sm:px-4 sm:py-6 ${compact ? "py-3" : "max-w-7xl"}`}>{body}</main>
      {creating && <NewTeamDialog onClose={() => setCreating(false)} onCreated={(id) => { setTeamId(id); setCreating(false); }} />}
    </div>
  );
}

/**
 * Desktop menu (≥ lg). v0.11, feedback ABC point 4: the old single row had `overflow-x-auto` and no visible
 * scrollbar, so on a PC the last items (Objetivos, Definições… more in EN/FR or with the team selector)
 * were simply cut off. Now the items that don't fit go into a "Mais ▾" menu, measured on every resize
 * (priority+ pattern): nothing is ever hidden, at any width or language. The mobile drawer is unchanged.
 */
function DesktopNav({ links, isActive }: { links: NavItem[]; isActive: (href: string) => boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(links.length);
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, moreRef);
  const key = links.map((l) => l.href).join("|");

  useLayoutEffect(() => {
    const el = wrap.current, m = measure.current;
    if (!el || !m) return;
    const calc = () => {
      const avail = el.clientWidth;
      if (!avail) return; // hidden (mobile): nothing to do
      const GAP = 4; // gap-1
      const widths = [...m.children].map((c) => c.getBoundingClientRect().width + GAP);
      const moreW = widths.pop() ?? 0; // last measured child = the "Mais" button
      if (widths.reduce((a, w) => a + w, 0) <= avail) { setFit(widths.length); return; }
      let used = moreW, n = 0;
      for (const w of widths) { if (used + w > avail) break; used += w; n++; }
      setFit(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  const cls = (href: string) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${isActive(href) ? "bg-panel-2 text-fg" : href === "/admin" ? "text-brand hover:text-brand-2" : "text-muted hover:text-fg"}`;
  const shown = links.slice(0, fit);
  const rest = links.slice(fit);
  const restActive = rest.some((n) => isActive(n.href));
  return (
    <div ref={wrap} className="relative hidden min-w-0 flex-1 lg:block">
      {/* invisible copy of every item, only to measure widths */}
      <div ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
        {links.map((n) => <span key={n.href} className={cls(n.href)}>{t(n.label)}</span>)}
        <span className={cls("#more")}>{t("Mais")} ▾</span>
      </div>
      <nav className="flex items-center gap-1">
        {shown.map((n) => <Link key={n.href} href={n.href} className={cls(n.href)}>{t(n.label)}</Link>)}
        {rest.length > 0 && (
          <div className="relative" ref={moreRef}>
            <button className={`${cls("#more")} ${restActive ? "bg-panel-2 text-fg!" : ""}`} title={restActive ? t(rest.find((n) => isActive(n.href))!.label) : undefined} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
              {t("Mais")} ▾
            </button>
            {open && (
              <div className="card absolute left-0 top-10 z-40 grid min-w-48 gap-0.5 p-1.5 shadow-xl" role="menu" onClick={close}>
                {rest.map((n) => <Link key={n.href} href={n.href} role="menuitem" className={`${cls(n.href)} block`}>{t(n.label)}</Link>)}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

/**
 * v0.11: staff see when the server is missing a migration (tables/columns/storage). Before, the sync skipped
 * them silently — the phone kept the data and the PC never got it (feedback ABC point 4: "no PC não vejo").
 */
function MissingOnServerBar() {
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get);
  if (!s.missing?.length) return null;
  return (
    <div className="border-b border-bad/40 bg-bad/10 px-3 py-1.5 text-center text-xs text-bad print:hidden" role="status">
      {t("O servidor ainda não tem uma atualização da base de dados ({what}). Estes dados ficam só neste dispositivo até o dono da plataforma correr a migração em falta.", { what: s.missing.join(", ") })}{" "}
      <Link href="/definicoes#versao" className="underline">{t("Detalhes")}</Link>
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
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("Nova equipa")}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CreateTeam onCreated={onCreated} onCancel={onClose} />
      </div>
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
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const dot = s.state === "error" ? "bg-bad" : s.state === "offline" ? "bg-brand" : s.pending > 0 || s.state === "syncing" ? "bg-opp animate-pulse" : "bg-good";
  const label = s.state === "offline" ? t("Sem internet — guardado neste dispositivo")
    : s.state === "error" ? t("Erro de sincronização")
    : s.state === "syncing" ? t("A sincronizar…")
    : s.pending > 0 ? t("{n} alterações por enviar", { n: s.pending })
    : t("Tudo guardado na cloud");
  return (
    <div className="relative" ref={ref}>
      <button className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-md px-2 text-xs text-muted hover:bg-panel-2" onClick={() => setOpen(!open)} title={label}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="hidden lg:inline">{s.state === "offline" ? t("Offline") : s.pending ? t("{n} por enviar", { n: s.pending }) : t("Sincronizado")}</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-40 w-[min(18rem,calc(100vw-1.5rem))] p-3 text-sm shadow-xl">
          <div className="font-medium">{label}</div>
          {s.lastSync && <div className="mt-1 text-xs text-muted">{t("Última sincronização: {time}", { time: new Date(s.lastSync).toLocaleTimeString(locale()) })}</div>}
          {s.error && <div className="mt-2 text-xs text-bad">{s.error}</div>}
          <p className="mt-2 text-xs text-muted">{t("Podes registar sem internet: as alterações ficam guardadas aqui e são enviadas quando voltar a ligação.")}</p>
          <button className="btn mt-2 w-full py-1 text-xs" onClick={() => void syncNow()}>{t("Sincronizar agora")}</button>
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
    if (s.pending > 0 && !(await ask(t("Há {n} alterações ainda não enviadas. Se saíres agora perdem-se. Sair mesmo assim?", { n: s.pending }), { confirmText: t("Sair"), danger: true }))) return;
    await signOut();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-full bg-panel-2 text-xs font-semibold hover:bg-line" aria-label={t("Conta")}>
        {initials}
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-40 w-[min(16rem,calc(100vw-1.5rem))] p-3 text-sm shadow-xl" onClick={() => setOpen(false)}>
          <div className="font-medium">{profile?.fullName || t("Sem nome")}</div>
          <div className="truncate text-xs text-muted">{profile?.email}</div>
          {role && <div className="mt-1 text-xs text-brand">{role}</div>}
          {profile?.isAdmin && <div className="text-xs text-brand">{t("Administrador da plataforma")}</div>}
          <div className="mt-3 grid gap-1">
            <Link href="/conta" className="btn btn-ghost justify-start py-1.5">{t("A minha conta")}</Link>
            <button className="btn btn-ghost justify-start py-1.5" onClick={openNewTeam}>{t("+ Criar nova equipa")}</button>
            <Link href="/convite" className="btn btn-ghost justify-start py-1.5">{t("Entrar noutra equipa (código)")}</Link>
            <button className="btn btn-ghost justify-start py-1.5 text-bad" onClick={out}>{t("Terminar sessão")}</button>
          </div>
          <div className="mt-2 border-t border-line pt-2" onClick={(e) => e.stopPropagation()}><LanguagePicker compact /></div>
          <Link href="/definicoes#versao" className="mt-2 block text-[11px] text-muted hover:text-fg" title={t("Compara com o outro dispositivo: devem mostrar o mesmo")}>{versionLabel()}</Link>
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
            <h2 className="font-semibold">{t("Tens um código?")}</h2>
            <p className="mt-1 text-sm text-muted">{t("Se és jogador ou treinador adjunto, pede o código ao dono da equipa e escreve-o aqui.")}</p>
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
        <h1 className="text-2xl font-semibold">{t("Bem-vindo 👋")}</h1>
        <p className="mt-1 text-muted">{t("Cria a tua equipa para começar. Ficas como dono/treinador principal.")}</p>
      </>}
      <form onSubmit={submit} className={`card grid gap-4 p-5 ${onCancel ? "" : "mt-6"}`}>
        {onCancel && (
          <div>
            <h2 className="text-lg font-semibold">{t("Nova equipa")}</h2>
            <p className="text-sm text-muted">{t("Outro escalão, a equipa feminina ou a próxima época. Cada equipa tem o seu plantel, treinos e jogos; ficas como dono.")}</p>
          </div>
        )}
        <div>
          <label className="label">{t("Clube / equipa")}</label>
          <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t("Escalão")}</label>
            <input className="input" required placeholder="Sub-18" autoFocus={!!onCancel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Género")}</label>
            <select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as "M" | "F" })}>
              <option value="M">{t("Masculino")}</option>
              <option value="F">{t("Feminino")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("Época")}</label>
            <input className="input" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1">{t("Criar equipa")}</button>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>{t("Cancelar")}</button>}
        </div>
      </form>
      {!onCancel && <label className="mt-4 block cursor-pointer text-center text-sm text-muted hover:text-fg">
        {t("…ou")} <span className="text-brand underline">{t("importar uma cópia (.json)")}</span>
        <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            // a new team (own ids) is created from the file, so it never clashes with earlier imports
            const { teamId } = await importIntoTeam(data, team ?? null);
            markOwned(teamId);
            onCreated(teamId);
          } catch (err) { void notify(t("Erro ao importar: {msg}", { msg: (err as Error).message })); }
        }} />
      </label>}
      {mode === "cloud" && !onCancel && <p className="mt-2 text-center text-xs text-muted">{t("A cópia importada é enviada para a tua conta.")}</p>}
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
