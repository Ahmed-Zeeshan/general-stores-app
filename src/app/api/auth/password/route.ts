import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, forgetUser, handle, requireAnyUser } from "@/lib/api";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { hashPassword } from "@/lib/tenants";
import { User } from "@/models";

const Body = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").max(200),
});

/** Any logged-in user can change their own password. Every other login with the old password ends; this one carries on. */
export const POST = handle(async (req) => {
  const me = await requireAnyUser();
  const body = Body.parse(await req.json());
  const user = await User.findById(me.id).select("+passwordHash");
  if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Current password is wrong.");
  }
  user.passwordHash = await hashPassword(body.newPassword);
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();
  forgetUser(me.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession({ ...me, branchId: undefined, sv: user.sessionVersion }), sessionCookieOptions(req));
  return res;
});
