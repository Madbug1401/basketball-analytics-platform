/* Courtside service worker — lets the app open and work without internet (e.g. at the gym).
   Data already lives on the device (IndexedDB); this only caches the app itself.
   Registered as /sw.js?v=<build>, so every deploy gets a fresh cache. */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `courtside-${VERSION}`;

// every page of the app; dynamic pages are served from one shell ("_") — they read the id from the URL
const ROUTES = [
  "/", "/agenda", "/equipa", "/treinos", "/treinos/exercicios", "/jogos", "/adversarios", "/estatisticas", "/objetivos", "/definicoes",
  "/conta", "/convite", "/admin",
  "/jogos/_", "/jogos/_/logger", "/jogos/_/ao-vivo", "/treinos/_", "/jogadores/_",
];
const EXTRA = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable.png"];

/** /jogos/abc/logger → /jogos/_/logger */
function shellFor(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/treinos/exercicios") return p;
  const m = p.match(/^\/(jogos|treinos|jogadores)\/[^/]+(\/(logger|ao-vivo))?$/);
  if (m) return `/${m[1]}/_${m[2] || ""}`;
  return p;
}

async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set(EXTRA);
  await Promise.all(ROUTES.map(async (route) => {
    try {
      const res = await fetch(route, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put(route, res);
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0]);
    } catch { /* offline during install: cached later at runtime */ }
  }));
  await Promise.all([...assets].map(async (url) => {
    try {
      if (await cache.match(url)) return;
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.ok) await cache.put(url, res);
    } catch {}
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("courtside-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

async function navigate(request) {
  const url = new URL(request.url);
  const key = shellFor(url.pathname);
  const cache = await caches.open(CACHE);
  try {
    // weak gym wifi: don't wait forever for the network
    const res = await Promise.race([fetch(request), timeout(5000)]);
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) || (await cache.match("/")) || new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>" +
      "<body style='background:#0b0e13;color:#e8edf5;font-family:system-ui;padding:2rem'>" +
      "<h1>Sem ligação</h1><p>Abre a app uma vez com internet para ela ficar disponível offline.</p>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const net = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, YouTube… go straight to the network

  if (request.mode === "navigate") { event.respondWith(navigate(request)); return; }
  // RSC payloads for client-side navigation: network only. If it fails, Next.js falls back
  // to a full page load, which the navigate() handler above serves from the cache.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;
  if (url.pathname.startsWith("/_next/static/")) { event.respondWith(cacheFirst(request)); return; }
  if (/\.(png|svg|ico|webmanifest|json|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
