import { z } from "zod";
import { dateRange, handle } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { Expense, User } from "@/models";

export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { tid } = ctx;
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 30);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  const [list, users] = await Promise.all([
    Expense.find({ tenant: tid, date: { $gte: from, $lte: to }, ...(branch ? { branch } : {}) }).sort({ date: -1 }).lean(),
    User.find({ tenant: tid }).select("name").lean(),
  ]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return list.map((e) => ({ ...e, user: e.user ? { name: names.get(String(e.user)) ?? "" } : null }));
});

const Body = z.object({
  category: z.string().trim().min(1, "Choose a category"),
  amount: z.coerce.number().positive("Amount must be more than zero"),
  note: z.string().trim().optional(),
  method: z.enum(["cash", "bank", "jazzcash", "easypaisa", "card"]).default("cash"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const POST = handle(async (req) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const date = body.date ? new Date(`${body.date}T12:00:00`) : new Date();
  return Expense.create({ ...body, tenant: tid, branch: branchId, date, user: user.id });
});
