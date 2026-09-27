import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/pushKey";

// Sends a push notification to team members. The caller's own Supabase session decides who it may
// reach (push_targets checks membership/staff role), so this route holds no database secret.
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!privateKey || !sbUrl || !anon) return Response.json({ error: "Notificações não configuradas no servidor." }, { status: 501 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sem sessão." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Pedido inválido." }, { status: 400 }); }
  const teamId = str(body.teamId, 40);
  const players = Array.isArray(body.players) ? body.players.filter((p): p is string => typeof p === "string" && UUID.test(p)).slice(0, 60) : [];
  const staff = body.staff === true;
  const title = str(body.title, 80) || "Courtside";
  const text = str(body.body, 300);
  const url = str(body.url, 200);
  if (!UUID.test(teamId) || (!players.length && !staff) || !url.startsWith("/")) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const rpc = (fn: string, args: unknown) => fetch(`${sbUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const r = await rpc("push_targets", { p_team: teamId, p_players: players, p_staff: staff });
  if (!r.ok) return Response.json({ error: "Sem permissão." }, { status: r.status === 401 ? 401 : 403 });
  const targets = (await r.json()) as { endpoint: string; p256dh: string; auth: string }[];

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://basketball-analytics-platform.vercel.app", VAPID_PUBLIC_KEY, privateKey);
  const payload = JSON.stringify({ title, body: text, url, tag: str(body.tag, 60) || undefined });
  const results = await Promise.allSettled(targets.map((t) =>
    webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 86400, urgency: "normal" })));
  const gone = targets.filter((_, i) => {
    const res = results[i];
    const code = res.status === "rejected" ? (res.reason as { statusCode?: number })?.statusCode : 0;
    return code === 404 || code === 410;
  }).map((t) => t.endpoint);
  if (gone.length) await rpc("push_drop", { p_endpoints: gone }).catch(() => {});
  return Response.json({ sent: results.filter((x) => x.status === "fulfilled").length, failed: results.filter((x) => x.status === "rejected").length - gone.length, gone: gone.length });
}
