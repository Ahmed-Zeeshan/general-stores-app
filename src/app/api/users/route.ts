import { z } from "zod";
import { handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertSeatAvailable, hashPassword, USERNAME_RE } from "@/lib/tenants";
import { Branch, Tenant, User } from "@/models";
import { ApiError } from "@/lib/api";

export const GET = handle(async () => {
  const { tid } = await requireTenant(["owner"]);
  const [users, tenant] = await Promise.all([
    User.find({ tenant: tid }).sort({ createdAt: 1 }).lean(),
    Tenant.findById(tid).select("maxUsers").lean(),
  ]);
  return { users, maxUsers: tenant?.maxUsers ?? 0, activeUsers: users.filter((u) => u.active).length };
});

const Body = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, "Use 3-30 letters or numbers, no spaces"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["owner", "manager", "cashier"]),
  /** Empty = can work in (and switch between) all branches. */
  branch: z.string().regex(/^[a-f0-9]{24}$/i).optional().or(z.literal("")).or(z.null()),
});

export const POST = handle(async (req) => {
  const { tid, user: me } = await requireTenant(["owner"]);
  const body = Body.parse(await req.json());
  await assertSeatAvailable(tid);
  if (body.branch && !(await Branch.exists({ _id: body.branch, tenant: tid, active: true }))) throw new ApiError(400, "Branch not found.");
  const user = await User.create({
    tenant: tid,
    name: body.name,
    username: body.username,
    role: body.role,
    branch: body.branch || undefined,
    passwordHash: await hashPassword(body.password),
  });
  await logActivity({ tid, user: me }, { action: "user.create", summary: `Added staff ${body.name} (${body.username}) as ${body.role}`, refType: "user", refId: user._id });
  const { passwordHash: _omit, ...safe } = user.toObject();
  void _omit;
  return safe;
});
