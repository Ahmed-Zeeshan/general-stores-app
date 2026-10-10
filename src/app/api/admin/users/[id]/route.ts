import { z } from "zod";
import { ApiError, forgetUser, handle, requireSuperAdmin } from "@/lib/api";
import { assertSeatAvailable, hashPassword } from "@/lib/tenants";
import { User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(["owner", "manager", "cashier"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
});

/** Super admin support actions on any shop user: reset password, enable/disable, change role. */
export const PUT = handle<Ctx>(async (req, { params }) => {
  await requireSuperAdmin();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const target = await User.findById(id).lean();
  if (!target || target.role === "superadmin" || !target.tenant) throw new ApiError(404, "User not found.");
  if (body.active === true && !target.active) await assertSeatAvailable(target.tenant);

  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.role) update.role = body.role;
  if (body.active !== undefined) update.active = body.active;
  if (body.password) update.passwordHash = await hashPassword(body.password);
  const user = await User.findByIdAndUpdate(id, update, { new: true }).lean();
  forgetUser(id);
  return user;
});
