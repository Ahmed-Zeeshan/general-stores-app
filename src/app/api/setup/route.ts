import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { User } from "@/models";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { hashPassword, USERNAME_RE } from "@/lib/tenants";

/** First-run: is there any account yet? */
export const GET = handle(async () => {
  const count = await User.countDocuments();
  return { needsSetup: count === 0 };
});

const Body = z.object({
  name: z.string().trim().min(2, "Your name is required"),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, "Use 3-30 letters or numbers, no spaces"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Creates the platform super admin. Only works once, on an empty database. */
export const POST = handle(async (req) => {
  if ((await User.countDocuments()) > 0) throw new ApiError(400, "Setup is already done. Please log in.");
  const body = Body.parse(await req.json());
  const user = await User.create({
    name: body.name,
    username: body.username,
    passwordHash: await hashPassword(body.password),
    role: "superadmin",
  });
  const token = await signSession({ id: String(user._id), name: user.name, username: user.username, role: "superadmin", tenantId: null });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
});
