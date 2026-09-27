"use client";

import { useState } from "react";
import { cloudConfigured, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PushSettings } from "@/components/PushSettings";

export default function AccountPage() {
  const { session, profile, refresh } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const recovering = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nova") === "1";

  if (!cloudConfigured || !supabase) return <p className="text-muted">Modo local: sem conta.</p>;
  if (!session) return <p className="text-muted">A validar o link… Se nada acontecer, volta a pedir o email de recuperação.</p>;

  const saveName = async () => {
    const { error } = await supabase!.from("profiles").update({ full_name: (name ?? "").trim() }).eq("id", session.user.id);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Nome guardado." });
    if (!error) await refresh();
  };
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password alterada." });
    if (!error) setPw("");
  };

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <h1 className="text-2xl font-semibold">A minha conta</h1>
      {recovering && <p className="rounded-lg border border-brand bg-brand/10 px-3 py-2 text-sm">Define aqui a tua nova password.</p>}
      <div className="card grid gap-3 p-4">
        <div>
          <label className="label">Email</label>
          <input className="input" value={profile?.email ?? session.user.email ?? ""} disabled />
        </div>
        <div>
          <label className="label">Nome</label>
          <div className="flex gap-2">
            <input className="input" value={name ?? profile?.fullName ?? ""} onChange={(e) => setName(e.target.value)} />
            <button className="btn" onClick={saveName} disabled={name === null}>Guardar</button>
          </div>
        </div>
      </div>
      <PushSettings />
      <form onSubmit={savePw} className="card grid gap-3 p-4">
        <label className="label">Nova password</label>
        <input className="input" type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <button className="btn btn-primary">Alterar password</button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
