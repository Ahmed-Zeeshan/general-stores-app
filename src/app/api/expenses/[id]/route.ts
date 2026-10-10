import { handle, requireTenant } from "@/lib/api";
import { Expense } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant(["owner"]);
  const { id } = await params;
  await Expense.deleteOne({ _id: id, tenant: tid });
  return { ok: true };
});
