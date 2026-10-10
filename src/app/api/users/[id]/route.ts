import { z } from "zod";
import { ApiError, forgetUser, handle, requireTenant } from "@/lib/api";
import { assertSeatAvailable, hashPassword } from "@/lib/tenants";
import { User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(["owner", "manager", "cashier"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { user: me, tid } = await requireTenant(["owner"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const target = await User.findOne({ _id: id, tenant: tid }).lean();
  if (!target) throw new ApiError(404, "User not found.");
  if (id === me.id && (body.active === false || (body.role && body.role !== "owner"))) {
    throw new ApiError(400, "You cannot disable or demote your own account.");
  }
  if (body.active === true && !target.active) await assertSeatAvailable(tid);

  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.role) update.role = body.role;
  if (body.active !== undefined) update.active = body.active;
  if (body.password) update.passwordHash = await hashPassword(body.password);
  const updated = await User.findOneAndUpdate({ _id: id, tenant: tid }, update, { new: true }).lean();
  forgetUser(id);
  return updated;
});
