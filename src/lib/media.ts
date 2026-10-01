"use client";

/*
 * Drill attachments (v0.11): images, short videos, YouTube and other links on each drill of the library.
 *
 * Where things live
 * - The list of attachments is part of the drill row (`drills.media`, jsonb) and syncs like any other column.
 * - Links / YouTube: only the address.
 * - Files: Supabase Storage, private bucket `drill-media`, path `${teamId}/${drillId}/${mediaId}.${ext}`
 *   (policies in supabase/migrations/2026-10-01-v11.sql: the team reads, staff writes — the first folder is the team id).
 *   The bytes are first kept on this device (`db.mediaFiles`) and uploaded by `flushMediaUploads`, which the
 *   sync engine calls after each sync. So adding a photo at the gym without internet works: it goes up later.
 * - Local mode (no Supabase): the file stays in `db.mediaFiles` for good (not part of the .json export).
 *
 * Limits: images are resized on the device (longest side 1600 px, JPEG) so they are light on mobile data;
 * videos up to 50 MB (Supabase free plan: 50 MB per file, 1 GB in total) — longer videos belong on YouTube.
 *
 * Known trade-offs (fine for now, revisit if needed)
 * - Other devices need internet to open a file (signed URL); only the device that added it has it offline
 *   until it is uploaded.
 * - Removing an attachment while offline doesn't remove the stored file (orphan in Storage, harmless).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { db, uid } from "./db";
import { supabase, cloudConfigured } from "./supabase";
import type { Drill, DrillMedia } from "./types";
import { youtubeId } from "@/components/VideoPlayer";
import { t } from "./i18n";

export const MEDIA_BUCKET = "drill-media";
export const MAX_VIDEO_MB = 50;
const MAX_IMAGE_SIDE = 1600;

/** YouTube id only for real YouTube addresses (youtubeId() alone accepts any URL with ?v=). */
export function youtubeOf(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\.|^m\./, "");
    if (host !== "youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") return null;
  } catch { return null; }
  return youtubeId(url);
}

/** A link typed by the coach → attachment (YouTube recognised, anything else kept as a plain link). */
export function mediaFromUrl(raw: string, title?: string): DrillMedia | null {
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`; // "youtu.be/abc" pasted without the scheme
  try { new URL(url); } catch { return null; }
  return { id: uid(), kind: youtubeOf(url) ? "youtube" : "link", url, title: title?.trim() || undefined, createdAt: Date.now() };
}

/** Shrinks a photo to MAX_IMAGE_SIDE (JPEG). Keeps the original if it is already small or can't be decoded. */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file; // animations / vectors: as they are
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 800_000) { bmp.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

const extOf = (mime: string, name: string) =>
  mime === "image/jpeg" ? "jpg" : mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || name.split(".").pop() || "bin";

/**
 * Keeps a picked file on the device and returns its attachment (save it into drill.media).
 * Throws a translated message when the file is not an image/video or is too big.
 */
export async function mediaFromFile(file: File, teamId: string, drillId: string): Promise<DrillMedia> {
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
  if (!kind) throw new Error(t("Escolhe uma imagem ou um vídeo."));
  if (kind === "video" && file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(t("O vídeo tem mais de {mb} MB. Para vídeos maiores, põe-no no YouTube (pode ser \"não listado\") e cola aqui o link.", { mb: MAX_VIDEO_MB }));
  }
  const blob = kind === "image" ? await shrinkImage(file) : file;
  const mime = blob.type || file.type;
  const id = uid();
  const path = `${teamId}/${drillId}/${id}.${extOf(mime, file.name)}`;
  await db.mediaFiles.put({ id, teamId, path, blob, mime, uploaded: false });
  return { id, kind, path, title: file.name.replace(/\.[^.]+$/, ""), mime, size: blob.size, createdAt: Date.now() };
}

/**
 * Uploads the files waiting on this device (called by sync.ts after each sync). Uploaded files are removed
 * from the device (the drill row already points to them). Returns what is missing on the server, if anything.
 */
export async function flushMediaUploads(client: SupabaseClient): Promise<string[]> {
  const waiting = await db.mediaFiles.filter((f) => !f.uploaded).toArray();
  for (const f of waiting) {
    const { error } = await client.storage.from(MEDIA_BUCKET).upload(f.path, f.blob, { contentType: f.mime, upsert: true });
    if (error) {
      if (/bucket not found/i.test(error.message)) return [`storage.${MEDIA_BUCKET}`]; // migration v11 not run yet: keep everything queued
      if (/fetch|network|Failed to/i.test(error.message)) throw error;
      console.warn("drill media upload refused", f.path, error.message); // e.g. permission: keep it, try again next sync
      continue;
    }
    await db.mediaFiles.delete(f.id);
  }
  return [];
}

/** Forget one attachment's file (local copy and, when online, the stored file). The caller updates drill.media. */
export async function dropMediaFile(m: DrillMedia) {
  if (m.kind !== "image" && m.kind !== "video") return;
  await db.mediaFiles.delete(m.id);
  if (supabase && m.path) await supabase.storage.from(MEDIA_BUCKET).remove([m.path]).catch(() => {}); // offline: orphan, harmless
}

/** Deletes a drill and its stored files. */
export async function deleteDrill(drill: Drill) {
  for (const m of drill.media ?? []) await dropMediaFile(m);
  await db.drills.delete(drill.id);
}

/* ---------- showing a file ---------- */

const signed = new Map<string, { url: string; until: number }>();

/** Something an <img>/<video> can show: the local copy if this device has it, else a signed URL (1 h). */
export function useMediaSrc(m: DrillMedia): { src?: string; error?: string } {
  const [state, setState] = useState<{ src?: string; error?: string }>(() => (m.url ? { src: m.url } : {}));
  useEffect(() => {
    if (m.kind === "youtube" || m.kind === "link") return;
    let alive = true;
    let objectUrl: string | undefined;
    (async () => {
      const local = await db.mediaFiles.get(m.id);
      if (local) {
        objectUrl = URL.createObjectURL(local.blob);
        if (alive) setState({ src: objectUrl });
        return;
      }
      if (!cloudConfigured || !supabase || !m.path) { if (alive) setState({ error: t("Ficheiro só disponível no dispositivo onde foi adicionado.") }); return; }
      const hit = signed.get(m.path);
      if (hit && hit.until > Date.now()) { if (alive) setState({ src: hit.url }); return; }
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(m.path, 3600);
      if (!alive) return;
      if (error || !data) { setState({ error: navigator.onLine ? t("Ainda não foi possível abrir este ficheiro (pode estar a ser enviado).") : t("Sem internet: o ficheiro abre quando voltar a ligação.") }); return; }
      signed.set(m.path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
      setState({ src: data.signedUrl });
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [m.id, m.kind, m.path, m.url]);
  return state;
}

export const fmtSize = (bytes?: number) => (bytes ? (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`) : "");
