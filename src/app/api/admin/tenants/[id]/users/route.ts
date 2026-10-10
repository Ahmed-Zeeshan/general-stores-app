import { z } from "zod";
import { ApiError, handle, requireSuperAdmin } from "@/lib/api";
import { assertSeatAvailable, hashPassword, USERNAME_RE } from "@/lib/tenants";
import { Tenant, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, "Use 3-30 letters or numbers, no spaces"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["owner", "manager", "cashier"]),
});

/** Super admin adds a user to a shop (e.g. a new owner). The shop's user limit still applies. */
export const POST = handle<Ctx>(async (req, { params }) => {
  await requireSuperAdmin();
  const { id } = await params;
  if (!(await Tenant.exists({ _id: id }))) throw new ApiError(404, "Shop not found.");
  const body = Body.parse(await req.json());
  await assertSeatAvailable(id);
  const user = await User.create({ tenant: id, name: body.name, username: body.username, role: body.role, passwordHash: await hashPassword(body.password) });
  const { passwordHash: _omit, ...safe } = user.toObject();
  void _omit;
  return safe;
});
