"use client";

import { db, purgeTeamLocal } from "./db";
import { supabase } from "./supabase";
import { syncNow } from "./sync";

/**
 * Deletes a team and everything in it (players, practices, games, events).
 * Online: deletes on the server first (only the owner or an admin may), then locally.
 */
export async function deleteTeam(teamId: string) {
  if (supabase) {
    const { data, error } = await supabase.from("teams").delete().eq("id", teamId).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) {
      // nothing deleted: either it never reached the server, or we are not allowed
      const { data: still } = await supabase.from("teams").select("id").eq("id", teamId);
      if (still?.length) throw new Error("Sem permissão para eliminar esta equipa (só o dono ou um administrador).");
    }
  }
  await purgeTeamLocal(teamId);
}

/** Leaves a team (non-owners). */
export async function leaveTeam(teamId: string, userId: string) {
  if (!supabase) return;
  const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  await purgeTeamLocal(teamId);
  await syncNow();
}

export async function teamCounts(teamId: string) {
  const [players, games, events, practices] = await Promise.all([
    db.players.where("teamId").equals(teamId).count(),
    db.games.where("teamId").equals(teamId).count(),
    db.events.where("teamId").equals(teamId).count(),
    db.practices.where("teamId").equals(teamId).count(),
  ]);
  return { players, games, events, practices };
}
