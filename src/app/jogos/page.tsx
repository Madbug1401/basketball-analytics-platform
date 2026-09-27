"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, today, uid } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { useAccess } from "@/lib/auth";
import { gameStats } from "@/lib/stats";
import { youtubeId } from "@/components/VideoPlayer";
import type { VideoSource } from "@/lib/types";
import { DeleteGameButton } from "@/components/DeleteGame";
import { L, locale, t } from "@/lib/i18n";

export default function GamesPage() {
  const { team } = useTeam();
  const access = useAccess(team?.id);
  const router = useRouter();
  const data = useLiveQuery(async () => {
    if (!team) return null;
    const games = await db.games.where("teamId").equals(team.id).reverse().sortBy("date");
    const events = await db.events.where("teamId").equals(team.id).toArray();
    return games.map((g) => {
      const ev = events.filter((e) => e.gameId === g.id);
      const s = gameStats(ev, g.periods, g.periodMinutes);
      return { g, us: s.us.pts, opp: s.opp.pts, n: ev.length };
    });
  }, [team?.id]);

  const [f, setF] = useState({ opponent: "", date: today(), home: true, competition: "Regional", time: "", location: "", videoKind: "youtube" as VideoSource["kind"] | "live", url: "", periodMinutes: 10 });
  const [err, setErr] = useState("");

  if (!team || !data) return null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    let video: VideoSource = { kind: "none" };
    if (f.videoKind === "youtube") {
      if (!youtubeId(f.url)) return setErr(t("Link do YouTube inválido."));
      video = { kind: "youtube", url: f.url.trim() };
    } else if (f.videoKind === "url") video = { kind: "url", url: f.url.trim() };
    else if (f.videoKind === "file") video = { kind: "file" };
    const id = uid();
    await db.games.add({
      id, teamId: team.id, date: f.date, opponent: f.opponent.trim(), home: f.home,
      competition: f.competition || undefined, periods: 4, periodMinutes: f.periodMinutes, video, createdAt: Date.now(),
    });
    if (f.time || f.location.trim()) await db.agenda.put({ id, teamId: team.id, kind: "game", time: f.time || undefined, location: f.location.trim() || undefined });
    router.push(`/jogos/${id}/${f.videoKind === "live" ? "ao-vivo" : "logger"}`);
  };

  return (
    <div className={`grid gap-6 ${access.canEdit ? "lg:grid-cols-[1fr_360px]" : ""}`}>
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{t("Jogos")}</h1>
        <div className="card divide-y divide-line">
          {data.map(({ g, us, opp, n }) => {
            const res = n === 0 ? null : us > opp ? "V" : us < opp ? "D" : "E";
            const resLabel = res === "V" ? t("V") : res === "D" ? t("D") : res === "E" ? t("E") : null;
            return (
              <div key={g.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span className={`grid h-8 w-8 place-items-center rounded-md text-sm font-bold ${res === "V" ? "bg-good/20 text-good" : res === "D" ? "bg-bad/20 text-bad" : "bg-panel-2 text-muted"}`}>
                  {resLabel ?? "–"}
                </span>
                <Link href={`/jogos/${g.id}`} className="min-w-40 flex-1 hover:text-brand">
                  <div className="font-medium">{g.home ? "vs" : "@"} {g.opponent}</div>
                  <div className="text-xs text-muted">
                    {new Date(g.date + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" })}
                    {g.competition ? ` · ${g.competition}` : ""} · {n === 1 ? t("{n} evento", { n }) : t("{n} eventos", { n })}
                  </div>
                </Link>
                <div className="font-mono text-lg tabular-nums">{n ? `${us}–${opp}` : ""}</div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Link href={`/jogos/${g.id}`} className="btn flex-1 sm:flex-none">{t("Estatísticas")}</Link>
                  {access.canEdit && (g.video.kind === "none"
                    ? <Link href={`/jogos/${g.id}/ao-vivo`} className="btn btn-primary flex-1 sm:flex-none">{t("Ao vivo")}</Link>
                    : <Link href={`/jogos/${g.id}/logger`} className="btn btn-primary flex-1 sm:flex-none">{t("Registar")}</Link>)}
                  {access.canEdit && <DeleteGameButton game={g} compact className="flex-none px-3" />}
                </div>
              </div>
            );
          })}
          {data.length === 0 && <p className="p-8 text-center text-sm text-muted">{t("Nenhum jogo ainda. Cria o primeiro e começa a registar a partir do vídeo.")}</p>}
        </div>
      </section>

      {access.canEdit && <form onSubmit={create} className="card grid h-fit gap-3 p-4">
        <h2 className="font-semibold">{t("Novo jogo")}</h2>
        <div>
          <label className="label">{t("Adversário")}</label>
          <input className="input" required value={f.opponent} onChange={(e) => setF({ ...f, opponent: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("Data")}</label>
            <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Local")}</label>
            <select className="input" value={f.home ? "1" : "0"} onChange={(e) => setF({ ...f, home: e.target.value === "1" })}>
              <option value="1">{t("Casa")}</option><option value="0">{t("Fora")}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("Hora")}</label>
            <input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Pavilhão")}</label>
            <input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("Competição")}</label>
            <input className="input" value={f.competition} onChange={(e) => setF({ ...f, competition: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Min / período")}</label>
            <input className="input" inputMode="numeric" value={f.periodMinutes} onChange={(e) => setF({ ...f, periodMinutes: Number(e.target.value) || 10 })} />
          </div>
        </div>
        <div>
          <label className="label">{t("Como vais registar?")}</label>
          <button type="button" onClick={() => setF({ ...f, videoKind: "live" })} className={`btn mb-1 w-full ${f.videoKind === "live" ? "btn-primary" : ""}`}>● {t("Ao vivo, no banco (sem vídeo)")}</button>
          <div className="grid grid-cols-4 gap-1">
            {([["youtube", "YouTube"], ["file", "MP4"], ["url", L("Link")], ["none", L("Sem")]] as const).map(([k, label]) => (
              <button type="button" key={k} onClick={() => setF({ ...f, videoKind: k })} className={`btn px-2 ${f.videoKind === k ? "btn-primary" : ""}`}>{t(label)}</button>
            ))}
          </div>
        </div>
        {(f.videoKind === "youtube" || f.videoKind === "url") && (
          <input className="input" required placeholder={f.videoKind === "youtube" ? "https://youtube.com/watch?v=…" : t("https://…/jogo.mp4")} value={f.url}
            onChange={(e) => setF({ ...f, url: e.target.value })} />
        )}
        {f.videoKind === "file" && <p className="text-xs text-muted">{t("Vais escolher o ficheiro MP4 no ecrã de registo. O vídeo não sai do teu computador.")}</p>}
        {f.videoKind === "live" && <p className="text-xs text-muted">{t("Relógio de jogo, 5 em campo, faltas e descontos no telemóvel. Funciona sem internet. Depois podes juntar o vídeo e completar.")}</p>}
        {err && <p className="text-sm text-bad">{err}</p>}
        <button className="btn btn-primary">{f.videoKind === "live" ? t("Criar e começar ao vivo") : t("Criar e abrir registo")}</button>
      </form>}
    </div>
  );
}
