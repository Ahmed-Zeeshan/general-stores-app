import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Role } from "@/lib/session";
import { User } from "@/models";

/** Staff of this shop who have a PIN, for the "Switch user" screen on a shared counter. */
export const GET = handle(async () => {
  const { tid, user } = await requireTenant();
  const list = await User.find({ tenant: tid, active: true, hasPin: true }).select("name role").sort({ name: 1 }).lean();
  return list.map((u) => ({ _id: String(u._id), name: u.name, role: u.role, current: String(u._id) === user.id }));
});

const Body = z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/i), pin: z.string().regex(/^\d{4,6}$/, "Enter the 4 to 6 digit PIN") });

/** Wrong PINs in a row before the PIN is switched off (a 4-digit PIN cannot be guessed in 5 tries). */
const MAX_PIN_FAILURES = 5;

/**
 * Switch to another staff member of the same shop with their PIN (someone of this shop must already be
 * logged in on this computer). After 5 wrong PINs in a row the PIN stops working until the owner sets a
 * new one in Settings → Staff; the person can still log in with their password.
 */
export const POST = handle(async (req) => {
  const { tid, user: from } = await requireTenant();
  const { userId, pin } = Body.parse(await req.json());
  const key = `pin|${userId}`;
  const wait = await loginBlocked(key);
  if (wait) throw new ApiError(429, `Too many wrong PINs. Try again in ${wait} minute${wait === 1 ? "" : "s"}, or log in with the password.`);
  const u = await User.findOne({ _id: userId, tenant: tid, active: true, hasPin: true }).select("+pinHash");
  if (!u?.pinHash) throw new ApiError(404, "This person has no PIN. The owner can set one in Settings → Staff.");
  // Count the try before checking it, so many guesses sent at once cannot get past the limit.
  const counted = await User.findOneAndUpdate({ _id: u._id, hasPin: true, pinFailures: { $lt: MAX_PIN_FAILURES } }, { $inc: { pinFailures: 1 } }, { new: true }).select("pinFailures").lean();
  if (!counted) throw new ApiError(404, "This person has no PIN. The owner can set one in Settings → Staff.");
  if (!(await bcrypt.compare(pin, u.pinHash))) {
    await recordLoginFailure(key);
    if ((counted.pinFailures ?? 0) >= MAX_PIN_FAILURES) {
      await User.updateOne({ _id: u._id }, { $unset: { pinHash: 1 }, hasPin: false, pinFailures: 0 });
      await logActivity({ tid, user: from }, { action: "login.failed", summary: `PIN of ${u.name} switched off after ${MAX_PIN_FAILURES} wrong tries (by ${from.name})` });
      throw new ApiError(401, `Wrong PIN. ${u.name}'s PIN is now switched off after ${MAX_PIN_FAILURES} wrong tries — log in with the password, and the owner can set a new PIN.`);
    }
    await logActivity({ tid, user: from }, { action: "login.failed", summary: `Wrong PIN for ${u.name} (switch user)` });
    throw new ApiError(401, "Wrong PIN.");
  }
  await clearLoginFailures(key);
  await User.updateOne({ _id: u._id }, { lastLoginAt: new Date(), pinFailures: 0 });
  await logActivity({ tid, user: { id: String(u._id), name: u.name, role: u.role } }, { action: "login", summary: `${u.name} took over the counter from ${from.name} (PIN)` });
  const token = await signSession({ id: String(u._id), name: u.name, username: u.username, role: u.role as Role, tenantId: String(tid), sv: u.sessionVersion ?? 0 });
  const res = NextResponse.json({ ok: true, name: u.name, role: u.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
});
