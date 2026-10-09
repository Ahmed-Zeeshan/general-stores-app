import { z } from "zod";
import { dateRange, handle, requireUser } from "@/lib/api";
import { Expense } from "@/models";

export const GET = handle(async (req) => {
  await requireUser(["owner", "manager"]);
  const { from, to } = dateRange(new URL(req.url), 30);
  return Expense.find({ date: { $gte: from, $lte: to } }).sort({ date: -1 }).populate("user", "name").lean();
});

const Body = z.object({
  category: z.string().trim().min(1, "Choose a category"),
  amount: z.coerce.number().positive("Amount must be more than zero"),
  note: z.string().trim().optional(),
  date: z.string().optional(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const date = body.date ? new Date(`${body.date}T12:00:00`) : new Date();
  return Expense.create({ ...body, date, user: user.id });
});
