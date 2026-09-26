"use client";

import { useRef, useState } from "react";
import { db, exportAll, importAll } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { CreateTeam } from "@/components/Shell";

export default function SettingsPage() {
  const { team, teams, setTeamId } = useTeam();
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `courtside-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(`Cópia exportada (${data.events.length} eventos, ${data.games.length} jogos).`);
  };

  const doImport = async (f: File) => {
    try {
      await importAll(JSON.parse(await f.text()));
      setMsg("Dados importados com sucesso.");
    } catch (e) {
      setMsg(`Erro: ${(e as Error).message}`);
    }
  };

  if (adding) return <CreateTeam onCreated={(id) => { setTeamId(id); setAdding(false); }} />;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">Definições</h1>

      {team && (
        <section className="card grid gap-3 p-4 sm:grid-cols-4">
          <h2 className="font-semibold sm:col-span-4">Equipa atual</h2>
          <div className="sm:col-span-2"><label className="label">Nome</label><input className="input" value={team.name} onChange={(e) => db.teams.update(team.id, { name: e.target.value })} /></div>
          <div><label className="label">Escalão</label><input className="input" value={team.category} onChange={(e) => db.teams.update(team.id, { category: e.target.value })} /></div>
          <div><label className="label">Época</label><input className="input" value={team.season} onChange={(e) => db.teams.update(team.id, { season: e.target.value })} /></div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">Equipas ({teams.length})</h2>
        <p className="mt-1 text-sm text-muted">Cada equipa tem o seu plantel, treinos e jogos separados. Usa o seletor no topo para trocar.</p>
        <button className="btn mt-3" onClick={() => setAdding(true)}>+ Nova equipa</button>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Cópia de segurança</h2>
        <p className="mt-1 text-sm text-muted">
          Nesta versão os dados ficam guardados <b>só neste browser</b>. Exporta uma cópia depois de cada jogo e guarda-a (Drive, pen…).
          Também serve para passar os dados para o computador do Melvyn.
        </p>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={doExport}>Exportar tudo (.json)</button>
          <button className="btn" onClick={() => file.current?.click()}>Importar…</button>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </div>
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </section>
    </div>
  );
}
