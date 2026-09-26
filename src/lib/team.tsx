"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import type { Team } from "./types";

const KEY = "bap.currentTeam";

interface Ctx {
  team: Team | undefined;
  teams: Team[];
  loading: boolean;
  setTeamId: (id: string) => void;
}

const TeamCtx = createContext<Ctx>({ team: undefined, teams: [], loading: true, setTeamId: () => {} });

export function TeamProvider({ children }: { children: ReactNode }) {
  const teams = useLiveQuery(() => db.teams.orderBy("createdAt").toArray(), []);
  const [teamId, setId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(KEY); } catch { return null; }
  });

  const setTeamId = (id: string) => {
    setId(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  const team = teams?.find((t) => t.id === teamId) ?? teams?.[0];
  return (
    <TeamCtx.Provider value={{ team, teams: teams ?? [], loading: teams === undefined, setTeamId }}>
      {children}
    </TeamCtx.Provider>
  );
}

export const useTeam = () => useContext(TeamCtx);
