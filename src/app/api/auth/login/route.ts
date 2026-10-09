import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { User } from "@/models";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Role } from "@/lib/session";

const Body = z.object({ username: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });

export const POST = handle(async (req) => {
  const { username, password } = Body.parse(await req.json());
  const user = await User.findOne({ username, active: true }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, "Wrong username or password.");
  }
  const token = await signSession({ id: String(user._id), name: user.name, username: user.username, role: user.role as Role });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
