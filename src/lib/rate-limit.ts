import { AuthThrottle } from "@/models/AuthThrottle";

/**
 * Limits wrong passwords and PINs per account (not per address: addresses sent by the browser can be
 * faked). Kept in MongoDB, so restarting the app or running several app servers does not reset it.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/** Minutes to wait if this key has had too many failures, otherwise 0. */
export async function loginBlocked(key: string, max = MAX_FAILURES): Promise<number> {
  const f = await AuthThrottle.findOne({ key }).lean();
  if (!f || Date.now() - new Date(f.first).getTime() > WINDOW_MS) return 0;
  return f.count >= max ? Math.max(1, Math.ceil((new Date(f.first).getTime() + WINDOW_MS - Date.now()) / 60000)) : 0;
}

export async function recordLoginFailure(key: string) {
  const now = new Date();
  const fresh = { count: 1, first: now, expiresAt: new Date(now.getTime() + WINDOW_MS) };
  // Start a new window when there is none or the old one is over; otherwise count one more.
  const updated = await AuthThrottle.findOneAndUpdate({ key, first: { $gt: new Date(now.getTime() - WINDOW_MS) } }, { $inc: { count: 1 } });
  if (!updated) await AuthThrottle.updateOne({ key }, { $set: fresh }, { upsert: true });
}

export async function clearLoginFailures(key: string) {
  await AuthThrottle.deleteOne({ key });
}

/**
 * The visitor's address for the activity log. Only the last hop of X-Forwarded-For is used: that is the
 * one added by our own HTTPS server or reverse proxy; anything before it was sent by the browser.
 */
export function clientIp(h: Headers): string | undefined {
  const hops = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return hops?.at(-1) || h.get("x-real-ip") || undefined;
}
