import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handle, tenantBlockReason } from "@/lib/api";
import { Tenant, User } from "@/models";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Role } from "@/lib/session";

const Body = z.object({ username: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });

export const POST = handle(async (req) => {
  const { username, password } = Body.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${username}|${ip}`;
  const wait = loginBlocked(key);
  if (wait) throw new ApiError(429, `Too many wrong attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.`);

  const user = await User.findOne({ username }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordLoginFailure(key);
    throw new ApiError(401, "Wrong username or password.");
  }
  clearLoginFailures(key);
  if (!user.active) throw new ApiError(403, "Your account is disabled. Ask your shop owner.");
  if (user.role !== "superadmin") {
    const reason = tenantBlockReason(user.tenant ? await Tenant.findById(user.tenant).select("status expiresAt").lean() : null);
    if (reason) throw new ApiError(403, reason);
  }
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  const token = await signSession({
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role as Role,
    tenantId: user.tenant ? String(user.tenant) : null,
  });
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
