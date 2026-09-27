"use client";

import { db, type PushJob } from "./db";
import { cloudConfigured, supabase } from "./supabase";
import { VAPID_PUBLIC_KEY } from "./pushKey";

/* Push notifications (call-ups, messages, game plan…).
   The phone subscribes once (push_subs table); notifications are queued on this device and
   sent through /api/push when online, so they also work when the coach is offline at the gym. */

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function pushSupported() {
  return cloudConfigured && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // the SW is registered on load in production; don't wait forever for it
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}

export async function pushState(): Promise<PushState> {
  if (isIOS() && !standalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function saveSubscription(sub: PushSubscription) {
  if (!supabase) return;
  const j = sub.toJSON();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await supabase.from("push_subs").upsert({
    endpoint: sub.endpoint, user_id: data.session.user.id, p256dh: j.keys?.p256dh, auth: j.keys?.auth,
    ua: navigator.userAgent.slice(0, 200),
  }, { onConflict: "endpoint" });
}

const sameKey = (sub: PushSubscription) => {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // browser doesn't expose it: assume it's ours
  const a = new Uint8Array(k), b = b64ToBytes(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

/** This device's subscription for the CURRENT server key. A subscription made with an older key
 *  (the key pair was rotated) can't receive anything any more, so it is replaced. */
async function currentSubscription(reg: ServiceWorkerRegistration, create: boolean) {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub)) {
    await supabase?.from("push_subs").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
    sub = null;
    create = true;
  }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  return sub;
}

/** Ask permission and subscribe this device. Returns the new state. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) throw new Error("A app ainda não está instalada neste dispositivo. Recarrega a página e tenta outra vez.");
  const sub = await currentSubscription(reg, true);
  if (sub) await saveSubscription(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase?.from("push_subs").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  return pushState();
}

/** Re-save this device's subscription (after signing in as someone else, or if it was renewed). */
export async function refreshPushSubscription() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await registration();
  if (!reg) return;
  try {
    const sub = await currentSubscription(reg, false);
    if (sub) await saveSubscription(sub);
  } catch {}
}

/** Before signing out: this phone stops receiving the current user's notifications
 *  (otherwise the next person to sign in on it would get them, and couldn't claim the device). */
export async function forgetPushDevice() {
  if (!pushSupported()) return;
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase?.from("push_subs").delete().eq("endpoint", sub.endpoint);
  } catch {}
}

/** Queue a notification (sent now if online, otherwise when the connection comes back). */
export async function notify(job: Omit<PushJob, "seq" | "createdAt">) {
  if (!cloudConfigured) return;
  if (job.players && !job.players.length && !job.staff) return;
  await db.pushQueue.add({ ...job, createdAt: Date.now() });
  void flushPush();
}

let flushing = false;
export async function flushPush() {
  if (flushing || !supabase || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const jobs = await db.pushQueue.orderBy("seq").toArray();
    for (const j of jobs) {
      // too old to still be useful
      if (Date.now() - j.createdAt > 3 * 86400_000) { await db.pushQueue.delete(j.seq!); continue; }
      let res: Response;
      try {
        res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ teamId: j.teamId, players: j.players ?? [], staff: !!j.staff, title: j.title, body: j.body, url: j.url, tag: j.tag }),
        });
      } catch { break; } // offline: try later
      if ((res.status >= 500 && res.status !== 501) || res.status === 401) break; // server hiccup / expired session: keep the queue
      await db.pushQueue.delete(j.seq!); // sent, or not deliverable (not configured / not allowed)
    }
  } finally {
    flushing = false;
  }
}
