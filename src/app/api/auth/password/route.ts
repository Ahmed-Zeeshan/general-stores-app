import bcrypt from "bcryptjs";
import { z } from "zod";
import { ApiError, handle, requireAnyUser } from "@/lib/api";
import { hashPassword } from "@/lib/tenants";
import { User } from "@/models";

const Body = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

/** Any logged-in user can change their own password. */
export const POST = handle(async (req) => {
  const me = await requireAnyUser();
  const body = Body.parse(await req.json());
  const user = await User.findById(me.id).select("+passwordHash");
  if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Current password is wrong.");
  }
  user.passwordHash = await hashPassword(body.newPassword);
  await user.save();
  return { ok: true };
});
