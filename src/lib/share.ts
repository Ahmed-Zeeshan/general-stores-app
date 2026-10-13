import { createHmac, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";

/**
 * Links a customer can open without logging in (a bill, a repair slip, an installment plan), sent on
 * WhatsApp. The link carries the shop, the record and a signature made with the app's secret, so it
 * cannot be guessed or changed to show another record. Only works when the shop has set the public
 * address of the app (Settings), since a link to the shop PC's "localhost" opens nowhere.
 */
export const SHARE_TYPES = { s: "sale", r: "repair", i: "installment" } as const;
export type ShareKind = (typeof SHARE_TYPES)[keyof typeof SHARE_TYPES];
const CODE: Record<ShareKind, string> = { sale: "s", repair: "r", installment: "i" };

function sig(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters).");
  return createHmac("sha256", `share:${secret}`).update(payload).digest("base64url").slice(0, 22);
}

/** "s-<tenant>-<id>-<signature>" */
export function shareCode(kind: ShareKind, tid: Types.ObjectId | string, id: Types.ObjectId | string) {
  const payload = `${CODE[kind]}-${String(tid)}-${String(id)}`;
  return `${payload}-${sig(payload)}`;
}

export function readShareCode(code: string): { kind: ShareKind; tid: Types.ObjectId; id: Types.ObjectId } | null {
  const m = /^([sri])-([a-f0-9]{24})-([a-f0-9]{24})-([A-Za-z0-9_-]{22})$/.exec(code);
  if (!m) return null;
  const expected = Buffer.from(sig(`${m[1]}-${m[2]}-${m[3]}`));
  const given = Buffer.from(m[4]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { kind: SHARE_TYPES[m[1] as keyof typeof SHARE_TYPES], tid: new Types.ObjectId(m[2]), id: new Types.ObjectId(m[3]) };
}

/** Full link, or null when the shop has no public address set. */
export function shareUrl(publicUrl: string | undefined | null, kind: ShareKind, tid: Types.ObjectId | string, id: Types.ObjectId | string) {
  if (!publicUrl) return null;
  return `${publicUrl.replace(/\/+$/, "")}/r/${shareCode(kind, tid, id)}`;
}
