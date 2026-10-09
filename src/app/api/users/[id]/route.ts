import bcrypt from "bcryptjs";
import { z } from "zod";
import { ApiError, handle, requireUser } from "@/lib/api";
import { User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(["owner", "manager", "cashier"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const me = await requireUser(["owner"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  if (id === me.id && (body.active === false || (body.role && body.role !== "owner"))) {
    throw new ApiError(400, "You cannot deactivate or demote your own account.");
  }
  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.role) update.role = body.role;
  if (body.active !== undefined) update.active = body.active;
  if (body.password) update.passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!user) throw new ApiError(404, "User not found.");
  return user;
});
