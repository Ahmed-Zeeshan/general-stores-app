import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { User } from "@/models";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { hashPassword, USERNAME_RE } from "@/lib/tenants";

/** First-run: is there any account yet? */
export const GET = handle(async () => {
  const count = await User.countDocuments();
  return { needsSetup: count === 0, needsToken: count === 0 && !!process.env.SETUP_TOKEN };
});

const Body = z.object({
  name: z.string().trim().min(2, "Your name is required"),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, "Use 3-30 letters or numbers, no spaces"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  setupToken: z.string().max(200).optional(),
});

/** With SETUP_TOKEN set (recommended on a server reachable from the internet), only someone who knows it can create the admin. */
function tokenOk(given: string | undefined) {
  const want = process.env.SETUP_TOKEN;
  if (!want) return true;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Creates the platform super admin. Only works once, on an empty database. */
export const POST = handle(async (req) => {
  if ((await User.countDocuments()) > 0) throw new ApiError(400, "Setup is already done. Please log in.");
  const body = Body.parse(await req.json());
  if (!tokenOk(body.setupToken)) throw new ApiError(403, "Wrong setup code. It is the SETUP_TOKEN in the server's settings file.");
  // Two setups at the same moment: only the first gets the lock.
  const locks = mongoose.connection.collection<{ _id: string }>("system_locks");
  try {
    await locks.insertOne({ _id: "setup" });
  } catch {
    throw new ApiError(400, "Setup is already done. Please log in.");
  }
  let user;
  try {
    user = await User.create({ name: body.name, username: body.username, passwordHash: await hashPassword(body.password), role: "superadmin" });
  } catch (err) {
    await locks.deleteOne({ _id: "setup" });
    throw err;
  }
  const token = await signSession({ id: String(user._id), name: user.name, username: user.username, role: "superadmin", tenantId: null, sv: 0 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
});
