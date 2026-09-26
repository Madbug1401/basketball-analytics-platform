"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PENDING_INVITE_KEY, useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";

function inviteFromUrl() {
  if (typeof window === "undefined") return null;
  const c = new URLSearchParams(window.location.search).get("c");
  if (c) { try { localStorage.setItem(PENDING_INVITE_KEY, c.toUpperCase()); } catch {} return c.toUpperCase(); }
  try { return localStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
}

export function AuthScreen() {
  const [invite] = useState(inviteFromUrl);
  const [tab, setTab] = useState<"login" | "signup" | "forgot">(invite ? "signup" : "login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
      } else if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(),
          password: f.password,
          options: { data: { full_name: f.name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, text: "Conta criada! Abre o email que te enviámos para confirmar e depois entra aqui." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: `${window.location.origin}/conta?nova=1` });
        if (error) throw error;
        setMsg({ ok: true, text: "Se o email existir, recebes um link para definir uma nova password." });
      }
    } catch (err) {
      setMsg({ ok: false, text: translate((err as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-semibold tracking-tight">Courtside</div>
          <p className="mt-1 text-sm text-muted">Gestão e análise de basquetebol</p>
        </div>
        {invite && (
          <div className="mb-4 rounded-lg border border-brand bg-brand/10 px-3 py-2 text-sm">
            Foste convidado para uma equipa (código <b className="font-mono">{invite}</b>). Cria conta ou entra para aceitar.
          </div>
        )}
        <div className="card p-5">
          {tab !== "forgot" && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
              <button className={`rounded-md py-1.5 text-sm ${tab === "login" ? "bg-panel-2" : "text-muted"}`} onClick={() => setTab("login")}>Entrar</button>
              <button className={`rounded-md py-1.5 text-sm ${tab === "signup" ? "bg-panel-2" : "text-muted"}`} onClick={() => setTab("signup")}>Criar conta</button>
            </div>
          )}
          <form onSubmit={submit} className="grid gap-3">
            {tab === "signup" && (
              <div>
                <label className="label">Nome</label>
                <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
            </div>
            {tab !== "forgot" && (
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" required minLength={6} value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={tab === "login" ? "current-password" : "new-password"} />
              </div>
            )}
            {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "…" : tab === "login" ? "Entrar" : tab === "signup" ? "Criar conta" : "Enviar link"}
            </button>
          </form>
          <div className="mt-3 text-center text-xs text-muted">
            {tab === "forgot"
              ? <button className="tap hover:text-fg" onClick={() => setTab("login")}>← Voltar</button>
              : <button className="hover:text-fg" onClick={() => setTab("forgot")}>Esqueci-me da password</button>}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Jogadores: criem conta e usem o código que o treinador vos deu.
        </p>
      </div>
    </div>
  );
}

function translate(m: string) {
  if (/Invalid login credentials/i.test(m)) return "Email ou password errados.";
  if (/Email not confirmed/i.test(m)) return "Ainda não confirmaste o email. Vê a tua caixa de correio.";
  if (/already registered/i.test(m)) return "Já existe uma conta com este email. Usa \"Entrar\".";
  if (/Password should be/i.test(m)) return "A password tem de ter pelo menos 6 caracteres.";
  if (/rate limit/i.test(m)) return "Demasiadas tentativas. Espera um pouco e tenta de novo.";
  return m;
}

export function JoinWithCode({ onJoined }: { onJoined?: (teamId: string) => void }) {
  const { claimInvite } = useAuth();
  const { setTeamId } = useTeam();
  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return "";
    const c = new URLSearchParams(window.location.search).get("c");
    return c ? c.toUpperCase() : "";
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const teamId = await claimInvite(code);
      setTeamId(teamId);
      setMsg({ ok: true, text: "Entraste na equipa!" });
      onJoined?.(teamId);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2">
      <input className="input text-center font-mono text-lg uppercase tracking-[0.4em]" maxLength={6} placeholder="ABC123" required
        value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Código de convite" />
      <button className="btn btn-primary" disabled={busy || code.trim().length < 6}>{busy ? "…" : "Entrar na equipa"}</button>
      {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </form>
  );
}
