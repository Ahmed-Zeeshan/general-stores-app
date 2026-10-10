import { z } from "zod";
import { dateRange, handle, requireTenant } from "@/lib/api";
import { Expense, User } from "@/models";

export const GET = handle(async (req) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { from, to } = dateRange(new URL(req.url), 30);
  const [list, users] = await Promise.all([
    Expense.find({ tenant: tid, date: { $gte: from, $lte: to } }).sort({ date: -1 }).lean(),
    User.find({ tenant: tid }).select("name").lean(),
  ]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return list.map((e) => ({ ...e, user: e.user ? { name: names.get(String(e.user)) ?? "" } : null }));
});

const Body = z.object({
  category: z.string().trim().min(1, "Choose a category"),
  amount: z.coerce.number().positive("Amount must be more than zero"),
  note: z.string().trim().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const POST = handle(async (req) => {
  const { user, tid } = await requireTenant(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const date = body.date ? new Date(`${body.date}T12:00:00`) : new Date();
  return Expense.create({ ...body, tenant: tid, date, user: user.id });
});
