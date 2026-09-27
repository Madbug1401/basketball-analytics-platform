import type { GameStats, Line } from "./stats";
import { reb } from "./stats";
import type { Insight } from "./insights";
import type { Game, Player, Team } from "./types";
import { locale, t } from "./i18n";

/* Builds a 1080×1350 PNG (good for WhatsApp / Instagram) and a plain-text summary of a game. */

export const C = {
  bg: "#0b0e13", panel: "#131821", panel2: "#1a2130", line: "#263044", muted: "#8a96ab",
  fg: "#e8edf5", brand: "#ff7a1a", good: "#34d399", bad: "#f87171", opp: "#60a5fa",
};
export const FONT = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace';

export interface CardData {
  team: Team;
  game: Game;
  stats: GameStats;
  players: Player[];
  insights: Insight[];
  includeBox: boolean;
}

const dateLabel = (d: string) => new Date(d + "T12:00").toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
const first = (p: Player) => p.name.split(" ")[0];

function rows(d: CardData) {
  const byId = new Map(d.players.map((p) => [p.id, p]));
  return [...d.stats.players.entries()]
    .map(([id, l]) => ({ p: byId.get(id), l }))
    .filter((r): r is { p: Player; l: Line } => !!r.p && r.l.gp > 0)
    .sort((a, b) => b.l.pts - a.l.pts || reb(b.l) - reb(a.l));
}

function leader(d: CardData, f: (l: Line) => number) {
  const r = rows(d).map((x) => ({ ...x, v: f(x.l) })).sort((a, b) => b.v - a.v)[0];
  return r && r.v > 0 ? r : null;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

export async function renderCard(d: CardData): Promise<Blob> {
  const W = 1080, H = 1350, P = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const { us, opp } = d.stats;
  const win = us.pts > opp.pts, tie = us.pts === opp.pts;

  // background
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, 460);
  grad.addColorStop(0, win ? "rgba(52,211,153,0.18)" : tie ? "rgba(138,150,171,0.15)" : "rgba(248,113,113,0.16)");
  grad.addColorStop(1, "rgba(11,14,19,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 460);

  // header
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.brand; ctx.font = `700 30px ${FONT}`;
  ctx.fillText(`${d.team.name} ${d.team.category}`.toUpperCase(), P, 92);
  ctx.fillStyle = C.muted; ctx.font = `400 26px ${FONT}`;
  ctx.fillText(fit(ctx, [dateLabel(d.game.date), d.game.competition, d.game.home ? t("Casa") : t("Fora")].filter(Boolean).join(" · "), W - 2 * P), P, 134);

  // result pill
  const pill = win ? t("VITÓRIA") : tie ? t("EMPATE") : t("DERROTA");
  ctx.font = `800 26px ${FONT}`;
  const pw = ctx.measureText(pill).width + 40;
  roundRect(ctx, W - P - pw, 62, pw, 46, 23);
  ctx.fillStyle = win ? "rgba(52,211,153,0.2)" : tie ? C.panel2 : "rgba(248,113,113,0.2)"; ctx.fill();
  ctx.fillStyle = win ? C.good : tie ? C.muted : C.bad;
  ctx.textAlign = "center"; ctx.fillText(pill, W - P - pw / 2, 94); ctx.textAlign = "left";

  // score
  const colW = (W - 2 * P) / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = C.muted; ctx.font = `600 30px ${FONT}`;
  ctx.fillText(fit(ctx, d.team.name.toUpperCase(), colW - 40), P + colW / 2, 222);
  ctx.fillText(fit(ctx, d.game.opponent.toUpperCase(), colW - 40), P + colW * 1.5, 222);
  ctx.font = `800 170px ${MONO}`;
  ctx.fillStyle = C.fg; ctx.fillText(String(us.pts), P + colW / 2, 382);
  ctx.fillStyle = C.opp; ctx.fillText(String(opp.pts), P + colW * 1.5, 382);
  ctx.fillStyle = C.line; ctx.fillRect(W / 2 - 1, 250, 2, 120);

  // quarters
  let y = 440;
  const periods = d.stats.byPeriod;
  const cellW = Math.min(120, (W - 2 * P - 200) / (periods.length + 1));
  roundRect(ctx, P, y, W - 2 * P, 132, 20); ctx.fillStyle = C.panel; ctx.fill();
  ctx.font = `600 22px ${FONT}`; ctx.fillStyle = C.muted;
  ctx.textAlign = "left"; ctx.fillText(t("PARCIAIS"), P + 28, y + 40);
  ctx.textAlign = "center";
  periods.forEach((p, i) => {
    const x = P + 230 + i * cellW + cellW / 2;
    ctx.fillStyle = C.muted; ctx.font = `600 22px ${FONT}`;
    ctx.fillText(i < d.game.periods ? t("{n}º", { n: i + 1 }) : t("Pr{n}", { n: i - d.game.periods + 1 }), x, y + 40);
    ctx.font = `700 34px ${MONO}`;
    ctx.fillStyle = p.us > p.opp ? C.good : C.fg; ctx.fillText(String(p.us), x, y + 82);
    ctx.fillStyle = p.opp > p.us ? C.opp : C.muted; ctx.fillText(String(p.opp), x, y + 118);
  });
  ctx.textAlign = "left"; ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = C.fg; ctx.fillText(fit(ctx, d.team.name, 180), P + 28, y + 82);
  ctx.fillStyle = C.opp; ctx.fillText(fit(ctx, d.game.opponent, 180), P + 28, y + 118);
  y += 160;

  // leaders
  const leaders = [
    { label: t("PONTOS"), r: leader(d, (l) => l.pts) },
    { label: t("RESSALTOS"), r: leader(d, (l) => reb(l)) },
    { label: t("ASSISTÊNCIAS"), r: leader(d, (l) => l.ast) },
  ];
  const lw = (W - 2 * P - 2 * 20) / 3;
  leaders.forEach((ld, i) => {
    const x = P + i * (lw + 20);
    roundRect(ctx, x, y, lw, 150, 20); ctx.fillStyle = C.panel; ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = C.muted; ctx.font = `600 20px ${FONT}`; ctx.fillText(ld.label, x + 24, y + 38);
    if (ld.r) {
      ctx.fillStyle = C.brand; ctx.font = `800 60px ${MONO}`; ctx.fillText(String(ld.r.v), x + 24, y + 102);
      ctx.fillStyle = C.fg; ctx.font = `600 24px ${FONT}`;
      ctx.fillText(fit(ctx, `#${ld.r.p.number} ${first(ld.r.p)}`, lw - 48), x + 24, y + 136);
    } else {
      ctx.fillStyle = C.muted; ctx.font = `400 24px ${FONT}`; ctx.fillText("—", x + 24, y + 100);
    }
  });
  y += 178;

  // box score or team comparison
  const r = rows(d).slice(0, 10);
  if (d.includeBox && r.length) {
    const cols = [
      { h: "", w: 350, a: "left" as const, v: (x: { p: Player; l: Line }) => `#${x.p.number} ${x.p.name}` },
      { h: t("PTS"), w: 110, a: "right" as const, v: (x: { p: Player; l: Line }) => String(x.l.pts) },
      { h: t("RES"), w: 110, a: "right" as const, v: (x: { p: Player; l: Line }) => String(reb(x.l)) },
      { h: t("AST"), w: 110, a: "right" as const, v: (x: { p: Player; l: Line }) => String(x.l.ast) },
      { h: t("LC"), w: 150, a: "right" as const, v: (x: { p: Player; l: Line }) => `${x.l.fgm}/${x.l.fga}` },
      { h: "+/-", w: 88, a: "right" as const, v: (x: { p: Player; l: Line }) => (x.l.pm > 0 ? `+${x.l.pm}` : String(x.l.pm)) },
    ];
    const rowH = Math.min(44, (H - y - 170) / (r.length + 1));
    roundRect(ctx, P, y, W - 2 * P, rowH * (r.length + 1) + 24, 20); ctx.fillStyle = C.panel; ctx.fill();
    let cx = P + 24;
    ctx.font = `600 20px ${FONT}`; ctx.fillStyle = C.muted;
    cols.forEach((c) => { ctx.textAlign = c.a; ctx.fillText(c.h, c.a === "left" ? cx : cx + c.w - 8, y + 36); cx += c.w; });
    r.forEach((row, i) => {
      const ry = y + 36 + (i + 1) * rowH;
      cx = P + 24;
      cols.forEach((c, j) => {
        ctx.textAlign = c.a;
        ctx.font = j === 0 ? `500 25px ${FONT}` : `600 26px ${MONO}`;
        ctx.fillStyle = j === 1 ? C.fg : j === 5 ? (row.l.pm > 0 ? C.good : row.l.pm < 0 ? C.bad : C.muted) : j === 0 ? C.fg : C.muted;
        const text = j === 0 ? fit(ctx, c.v(row), c.w - 16) : c.v(row);
        ctx.fillText(text, c.a === "left" ? cx : cx + c.w - 8, ry);
        cx += c.w;
      });
    });
    y += rowH * (r.length + 1) + 48;
  } else {
    const stat = (label: string, a: string, b: string) => ({ label, a, b });
    const pctS = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : "–");
    const list = [
      stat(t("Lançamentos"), `${us.fgm}/${us.fga} ${pctS(us.fgm, us.fga)}`, `${opp.fgm}/${opp.fga} ${pctS(opp.fgm, opp.fga)}`),
      stat(t("Triplos"), `${us.p3m}/${us.p3a}`, `${opp.p3m}/${opp.p3a}`),
      stat(t("Lances livres"), `${us.ftm}/${us.fta}`, `${opp.ftm}/${opp.fta}`),
      stat(t("Ressaltos"), String(reb(us)), String(reb(opp))),
      stat(t("Perdas de bola"), String(us.tov), String(opp.tov)),
    ];
    roundRect(ctx, P, y, W - 2 * P, 56 * list.length + 30, 20); ctx.fillStyle = C.panel; ctx.fill();
    list.forEach((s, i) => {
      const ry = y + 58 + i * 56;
      ctx.textAlign = "left"; ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`; ctx.fillText(s.label, P + 28, ry);
      ctx.textAlign = "right"; ctx.font = `600 28px ${MONO}`;
      ctx.fillStyle = C.fg; ctx.fillText(s.a, W - P - 300, ry);
      ctx.fillStyle = C.opp; ctx.fillText(s.b, W - P - 28, ry);
    });
    y += 56 * list.length + 58;
  }

  // one or two report highlights
  ctx.textAlign = "left";
  for (const it of d.insights.filter((x) => x.tone !== "info").slice(0, 2)) {
    if (y > H - 130) break;
    ctx.fillStyle = it.tone === "good" ? C.good : C.bad;
    ctx.fillRect(P, y - 26, 6, 34);
    ctx.fillStyle = C.fg; ctx.font = `600 26px ${FONT}`;
    ctx.fillText(fit(ctx, it.title, W - 2 * P - 24), P + 22, y);
    y += 48;
  }

  // footer
  ctx.fillStyle = C.line; ctx.fillRect(P, H - 86, W - 2 * P, 1);
  ctx.fillStyle = C.muted; ctx.font = `500 22px ${FONT}`; ctx.textAlign = "left";
  ctx.fillText(t("Época {season}", { season: d.team.season }), P, H - 44);
  ctx.textAlign = "right"; ctx.fillStyle = C.brand; ctx.font = `700 24px ${FONT}`;
  ctx.fillText("Courtside", W - P, H - 44);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t("Não foi possível gerar a imagem")))), "image/png"));
}

export function summaryText(d: CardData) {
  const { us, opp } = d.stats;
  const res = us.pts > opp.pts ? t("Vitória") : us.pts < opp.pts ? t("Derrota") : t("Empate");
  const lines = [
    `🏀 *${d.team.name} ${d.team.category} ${us.pts}–${opp.pts} ${d.game.opponent}* (${res})`,
    `${dateLabel(d.game.date)}${d.game.competition ? ` · ${d.game.competition}` : ""}`,
    t("Parciais: {list}", { list: d.stats.byPeriod.map((p) => `${p.us}-${p.opp}`).join(" | ") }),
  ];
  const top = rows(d).filter((r) => r.l.pts > 0).slice(0, 3);
  if (top.length) lines.push("", `*${t("Destaques")}*`, ...top.map((r) => `#${r.p.number} ${r.p.name}: ${t("{pts} pts, {reb} ress., {ast} ast.", { pts: r.l.pts, reb: reb(r.l), ast: r.l.ast })}`));
  const hi = d.insights.filter((x) => x.tone !== "info").slice(0, 2);
  if (hi.length) lines.push("", ...hi.map((x) => `• ${x.title}`));
  return lines.join("\n");
}

/** Draws wrapped text; returns the y after the last line. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 99) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (lines === maxLines - 1) { ctx.fillText(fit(ctx, line + " " + words.slice(i).join(" "), maxW), x, y); return y + lineH; }
      ctx.fillText(line, x, y);
      y += lineH; lines++;
      line = words[i];
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}
