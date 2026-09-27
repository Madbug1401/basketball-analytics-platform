import { C, FONT, MONO, fit, roundRect, wrap } from "./shareCard";
import type { ScoutReport } from "./scouting";
import type { Agenda, Team } from "./types";

/** 1080×1350 image of the pre-game scouting report. */
export async function renderScoutCard(r: ScoutReport, team: Team, nextInfo?: Agenda): Promise<Blob> {
  const W = 1080, H = 1350, P = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, 380);
  g.addColorStop(0, "rgba(96,165,250,0.16)"); g.addColorStop(1, "rgba(11,14,19,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 380);

  ctx.textAlign = "left";
  ctx.fillStyle = C.brand; ctx.font = `700 28px ${FONT}`;
  ctx.fillText(`SCOUTING · ${team.name} ${team.category}`.toUpperCase(), P, 90);
  ctx.fillStyle = C.fg; ctx.font = `800 76px ${FONT}`;
  ctx.fillText(fit(ctx, r.name, W - 2 * P), P, 178);
  ctx.fillStyle = C.muted; ctx.font = `400 28px ${FONT}`;
  const nextLine = r.next
    ? `Próximo jogo: ${new Date(r.next.date + "T12:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}${nextInfo?.time ? ` · ${nextInfo.time}` : ""}${nextInfo?.location ? ` · ${nextInfo.location}` : ""}`
    : "Relatório do adversário";
  ctx.fillText(fit(ctx, nextLine, W - 2 * P), P, 224);
  ctx.fillText(r.n ? `Contra eles: ${r.record.w}V ${r.record.l}D em ${r.n} jogo${r.n > 1 ? "s" : ""}` : "Sem jogos registados contra eles", P, 264);

  let y = 300;
  if (r.n) {
    const n = r.n;
    const kpis = [
      { l: "PONTOS DELES", v: (r.their.pts / n).toFixed(0), s: `nós ${(r.ours.pts / n).toFixed(0)}` },
      { l: "LC % DELES", v: r.their.fga ? `${Math.round((r.their.fgm / r.their.fga) * 100)}%` : "–", s: `3P ${r.their.p3a ? Math.round((r.their.p3m / r.their.p3a) * 100) : 0}%` },
      { l: "RESS. OF.", v: (r.their.oreb / n).toFixed(1), s: "por jogo" },
      { l: "PERDAS DELES", v: (r.their.tov / n).toFixed(1), s: `nós ${(r.ours.tov / n).toFixed(1)}` },
    ];
    const kw = (W - 2 * P - 3 * 16) / 4;
    kpis.forEach((k, i) => {
      const x = P + i * (kw + 16);
      roundRect(ctx, x, y, kw, 140, 18); ctx.fillStyle = C.panel; ctx.fill();
      ctx.fillStyle = C.muted; ctx.font = `600 19px ${FONT}`; ctx.fillText(k.l, x + 20, y + 36);
      ctx.fillStyle = C.fg; ctx.font = `800 52px ${MONO}`; ctx.fillText(k.v, x + 20, y + 94);
      ctx.fillStyle = C.muted; ctx.font = `400 20px ${FONT}`; ctx.fillText(k.s, x + 20, y + 124);
    });
    y += 172;

    // keys
    ctx.fillStyle = C.brand; ctx.font = `700 26px ${FONT}`; ctx.fillText("CHAVES DO JOGO", P, y + 10);
    y += 50;
    ctx.font = `500 27px ${FONT}`;
    for (const k of r.keys.slice(0, 5)) {
      ctx.fillStyle = C.brand; ctx.fillRect(P, y - 22, 6, 30);
      ctx.fillStyle = C.fg;
      y = wrap(ctx, k, P + 22, y, W - 2 * P - 22, 36, 2) + 12;
    }
    y += 6;

    // zones
    const zoneH = 46;
    roundRect(ctx, P, y, W - 2 * P, zoneH * 4 + 64, 18); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = C.muted; ctx.font = `600 20px ${FONT}`; ctx.fillText("ONDE LANÇAM", P + 24, y + 38);
    r.zones.forEach((z, i) => {
      const zy = y + 78 + i * zoneH;
      ctx.fillStyle = C.fg; ctx.font = `500 24px ${FONT}`; ctx.fillText(z.zone, P + 24, zy);
      const bx = P + 300, bw = W - 2 * P - 300 - 200;
      roundRect(ctx, bx, zy - 18, bw, 16, 8); ctx.fillStyle = C.panel2; ctx.fill();
      if (z.share) { roundRect(ctx, bx, zy - 18, Math.max(16, (bw * z.share) / 100), 16, 8); ctx.fillStyle = C.opp; ctx.fill(); }
      ctx.textAlign = "right"; ctx.fillStyle = C.fg; ctx.font = `600 24px ${MONO}`;
      ctx.fillText(`${z.share}%`, W - P - 110, zy);
      ctx.fillStyle = C.muted; ctx.fillText(z.pct === null ? "–" : `${z.pct}%`, W - P - 24, zy);
      ctx.textAlign = "left";
    });
    y += zoneH * 4 + 110;
  } else y += 10;

  // coach notes
  const notes = [r.notes?.keyPlayers && `Jogadores a vigiar: ${r.notes.keyPlayers}`, r.notes?.notes].filter(Boolean) as string[];
  if (notes.length && y < H - 180) {
    ctx.fillStyle = C.brand; ctx.font = `700 26px ${FONT}`; ctx.fillText("NOTAS DO TREINADOR", P, y);
    y += 44;
    ctx.fillStyle = C.fg; ctx.font = `400 26px ${FONT}`;
    for (const t of notes) {
      for (const para of t.split(/\n+/)) {
        if (y > H - 130) break;
        const room = Math.max(1, Math.floor((H - 130 - y) / 34));
        y = wrap(ctx, para, P, y, W - 2 * P, 34, Math.min(room, 4)) + 6;
      }
    }
  }

  ctx.fillStyle = C.line; ctx.fillRect(P, H - 86, W - 2 * P, 1);
  ctx.fillStyle = C.muted; ctx.font = `500 22px ${FONT}`; ctx.textAlign = "left";
  ctx.fillText(`Época ${team.season} · uso interno da equipa`, P, H - 44);
  ctx.textAlign = "right"; ctx.fillStyle = C.brand; ctx.font = `700 24px ${FONT}`;
  ctx.fillText("Courtside", W - P, H - 44);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Não foi possível gerar a imagem"))), "image/png"));
}

export function scoutText(r: ScoutReport, team: Team) {
  const lines = [`🏀 *Scouting — ${r.name}* (${team.name} ${team.category})`];
  if (r.next) lines.push(`Próximo jogo: ${new Date(r.next.date + "T12:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}`);
  if (r.n) lines.push(`Contra eles: ${r.record.w}V ${r.record.l}D · ${(r.ours.pts / r.n).toFixed(0)}–${(r.their.pts / r.n).toFixed(0)} em média`);
  if (r.keys.length) lines.push("", "*Chaves do jogo*", ...r.keys.map((k) => `• ${k}`));
  if (r.notes?.keyPlayers) lines.push("", `*A vigiar:* ${r.notes.keyPlayers}`);
  if (r.notes?.notes) lines.push("", r.notes.notes);
  return lines.join("\n");
}
