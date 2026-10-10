import { handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Expense } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid, user } = await requireTenant(["owner"]);
  const { id } = await params;
  const x = await Expense.findOneAndDelete({ _id: id, tenant: tid }).lean();
  if (x) await logActivity({ tid, user }, { action: "expense.delete", summary: `Deleted expense ${x.category} Rs ${x.amount}${x.note ? ` — ${x.note}` : ""}`, amount: x.amount });
  return { ok: true };
});
