import bcrypt from "bcryptjs";
import { z } from "zod";
import { handle, requireUser } from "@/lib/api";
import { User } from "@/models";

export const GET = handle(async () => {
  await requireUser(["owner"]);
  return User.find().sort({ createdAt: 1 }).lean();
});

const Body = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Use 3-30 letters or numbers, no spaces"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["owner", "manager", "cashier"]),
});

export const POST = handle(async (req) => {
  await requireUser(["owner"]);
  const body = Body.parse(await req.json());
  const user = await User.create({ ...body, passwordHash: await bcrypt.hash(body.password, 10) });
  const { passwordHash: _omit, ...safe } = user.toObject();
  void _omit;
  return safe;
});
