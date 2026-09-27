"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { t } from "@/lib/i18n";

export interface PlayerHandle {
  getTime: () => number;
  seek: (sec: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  nudge: (delta: number) => void;
  setRate: (r: number) => void;
  getRate: () => number;
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(embed|live|shorts)\/([\w-]{6,})/);
    return m ? m[2] : null;
  } catch {
    return /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
  }
}

/* ---------- YouTube ---------- */

type YTPlayer = {
  getCurrentTime(): number;
  seekTo(s: number, allow: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  setPlaybackRate(r: number): void;
  getPlaybackRate(): number;
  destroy(): void;
};

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReady: Promise<void> | null = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

export const YouTubePlayer = forwardRef<PlayerHandle, { videoId: string }>(function YouTubePlayer({ videoId }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const rate = useRef(1);

  useEffect(() => {
    let cancelled = false;
    loadYT().then(() => {
      if (cancelled || !host.current || !window.YT) return;
      const el = document.createElement("div");
      host.current.innerHTML = "";
      host.current.appendChild(el);
      player.current = new window.YT.Player(el, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      });
    });
    return () => {
      cancelled = true;
      player.current?.destroy?.();
      player.current = null;
    };
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    getTime: () => player.current?.getCurrentTime?.() ?? 0,
    seek: (sec) => player.current?.seekTo?.(Math.max(0, sec), true),
    play: () => player.current?.playVideo?.(),
    pause: () => player.current?.pauseVideo?.(),
    toggle: () => {
      const p = player.current;
      if (!p) return;
      if (p.getPlayerState() === 1) p.pauseVideo();
      else p.playVideo();
    },
    nudge: (d) => {
      const p = player.current;
      if (p) p.seekTo(Math.max(0, p.getCurrentTime() + d), true);
    },
    setRate: (r) => {
      rate.current = r;
      player.current?.setPlaybackRate?.(r);
    },
    getRate: () => player.current?.getPlaybackRate?.() ?? rate.current,
  }));

  return <div ref={host} className="aspect-video w-full overflow-hidden rounded-lg bg-black [&_iframe]:h-full [&_iframe]:w-full" />;
});

/* ---------- HTML5 (local MP4 or direct URL) ---------- */

export const Html5Player = forwardRef<PlayerHandle, { src: string }>(function Html5Player({ src }, ref) {
  const v = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => ({
    getTime: () => v.current?.currentTime ?? 0,
    seek: (sec) => { if (v.current) v.current.currentTime = Math.max(0, sec); },
    play: () => { v.current?.play(); },
    pause: () => v.current?.pause(),
    toggle: () => { const el = v.current; if (!el) return; if (el.paused) el.play(); else el.pause(); },
    nudge: (d) => { if (v.current) v.current.currentTime = Math.max(0, v.current.currentTime + d); },
    setRate: (r) => { if (v.current) v.current.playbackRate = r; },
    getRate: () => v.current?.playbackRate ?? 1,
  }));
  return <video ref={v} src={src} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black" />;
});

/* ---------- No video: a stopwatch so events still get an order/time ---------- */

export const StopwatchPlayer = forwardRef<PlayerHandle, object>(function StopwatchPlayer(_, ref) {
  const [running, setRunning] = useState(false);
  const base = useRef(0); // accumulated seconds
  const started = useRef<number | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(i);
  }, [running]);

  const now = () => base.current + (started.current ? (Date.now() - started.current) / 1000 : 0);
  const api: PlayerHandle = {
    getTime: now,
    seek: (sec) => { base.current = Math.max(0, sec); if (started.current) started.current = Date.now(); force((n) => n + 1); },
    play: () => { if (!started.current) { started.current = Date.now(); setRunning(true); } },
    pause: () => { base.current = now(); started.current = null; setRunning(false); },
    toggle: () => (started.current ? api.pause() : api.play()),
    nudge: (d) => api.seek(now() + d),
    setRate: () => {},
    getRate: () => 1,
  };
  useImperativeHandle(ref, () => api);

  const time = now();
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-panel">
      <div className="font-mono text-5xl tabular-nums">
        {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, "0")}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn" onClick={() => api.nudge(-5)} aria-label={t("Recuar 5 segundos")}>−5s</button>
        <button type="button" className={`btn min-w-28 ${running ? "" : "btn-primary"}`} onClick={() => api.toggle()}>{running ? t("❚❚ Parar") : t("▶ Iniciar")}</button>
        <button type="button" className="btn" onClick={() => api.nudge(5)} aria-label={t("Avançar 5 segundos")}>+5s</button>
      </div>
      <p className="px-3 text-center text-xs text-muted">{t("Sem vídeo — cronómetro interno")}<span className="pointer-coarse:hidden"> · {t("Espaço para iniciar/parar")}</span></p>
    </div>
  );
});
