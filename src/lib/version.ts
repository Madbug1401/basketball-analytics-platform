/**
 * App version shown to users (account menu, Definições → "Versão e sincronização") — v0.11.
 * Bump APP_VERSION with each release (README "O que já faz", docs/ROADMAP.md).
 * BUILD_ID identifies the deploy (git commit on Vercel, build time elsewhere; see next.config.ts): comparing it
 * between the phone and the PC tells at once whether both run the same version (feedback ABC, point 4).
 */
export const APP_VERSION = "0.11";
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
export const versionLabel = () => `v${APP_VERSION} · ${BUILD_ID.slice(0, 7)}`;
