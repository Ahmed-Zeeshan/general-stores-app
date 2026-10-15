import { ApiError, handle } from "@/lib/api";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { Sale } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const ctx = await requireBranch();
  const { tid } = ctx;
  const { id } = await params;
  // Cashiers do not get the shop's cost prices.
  const sale = await Sale.findOne({ _id: id, tenant: tid }).select(ctx.user.role === "cashier" ? "-costTotal -items.cost" : "").lean();
  if (!sale) throw new ApiError(404, "Bill not found.");
  assertBranchAccess(ctx, sale.branch, "Bill");
  return sale;
});
