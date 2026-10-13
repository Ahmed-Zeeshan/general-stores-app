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

/**
 * Switch to another staff member of the same shop with their PIN (someone of this shop must already be
 * logged in on this computer). Wrong PINs are limited like wrong passwords.
 */
export const POST = handle(async (req) => {
  const { tid, user: from } = await requireTenant();
  const { userId, pin } = Body.parse(await req.json());
  const key = `pin|${userId}`;
  const wait = loginBlocked(key);
  if (wait) throw new ApiError(429, `Too many wrong PINs. Try again in ${wait} minute${wait === 1 ? "" : "s"}, or log in with the password.`);
  const u = await User.findOne({ _id: userId, tenant: tid, active: true, hasPin: true }).select("+pinHash");
  if (!u?.pinHash) throw new ApiError(404, "This person has no PIN. The owner can set one in Settings → Staff.");
  if (!(await bcrypt.compare(pin, u.pinHash))) {
    recordLoginFailure(key);
    await logActivity({ tid, user: from }, { action: "login.failed", summary: `Wrong PIN for ${u.name} (switch user)` });
    throw new ApiError(401, "Wrong PIN.");
  }
  clearLoginFailures(key);
  await User.updateOne({ _id: u._id }, { lastLoginAt: new Date() });
  await logActivity({ tid, user: { id: String(u._id), name: u.name, role: u.role } }, { action: "login", summary: `${u.name} took over the counter from ${from.name} (PIN)` });
  const token = await signSession({ id: String(u._id), name: u.name, username: u.username, role: u.role as Role, tenantId: String(tid) });
  const res = NextResponse.json({ ok: true, name: u.name, role: u.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
});
