"use client";

import Link from "next/link";
import type { ID, Player } from "@/lib/types";

export function LineupPicker({ players, value, onChange, onConfirm, onCancel, title, confirmLabel = "Confirmar neste momento do vídeo", hint = "A ordem escolhida define as teclas 1–5." }: {
  players: Player[]; value: ID[]; onChange: (v: ID[]) => void; onConfirm: () => void; onCancel?: () => void; title: string; confirmLabel?: string; hint?: string;
}) {
  const toggle = (id: ID) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length < 5 ? [...value, id] : value);
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className={`text-sm ${value.length === 5 ? "text-good" : "text-muted"}`}>{value.length}/5</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {players.map((p) => {
          const i = value.indexOf(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)}
              className={`relative min-h-11 truncate rounded-lg border px-2 py-2 text-left text-sm ${i >= 0 ? "border-brand bg-brand/15" : "border-line hover:border-muted"}`}>
              {i >= 0 && <span className="kbd absolute right-1 top-1">{i + 1}</span>}
              <b className="font-mono">#{p.number}</b> {p.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      {players.length === 0 && <p className="text-sm text-muted">Sem jogadores ativos — adiciona-os no <Link className="text-brand" href="/equipa">Plantel</Link>.</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary flex-1" disabled={value.length !== 5} onClick={onConfirm}>{confirmLabel}</button>
        {onCancel && <button className="btn" onClick={onCancel}>Cancelar</button>}
      </div>
      {hint && <p className="mt-2 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
