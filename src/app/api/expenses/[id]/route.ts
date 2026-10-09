import { handle, requireUser } from "@/lib/api";
import { Expense } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  await requireUser(["owner"]);
  const { id } = await params;
  await Expense.findByIdAndDelete(id);
  return { ok: true };
});
