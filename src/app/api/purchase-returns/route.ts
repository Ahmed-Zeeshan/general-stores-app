import { dateRange, escapeRegex, handle, isObjectId } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { PurchaseReturn } from "@/models";

/** Goods returned to suppliers in a period. */
export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 29);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  const q = url.searchParams.get("q")?.trim();
  const query: Record<string, unknown> = { tenant: ctx.tid, createdAt: { $gte: from, $lte: to }, ...(branch ? { branch } : {}) };
  // One return by id (a khata row or the activity log opens its purchase).
  const id = url.searchParams.get("id");
  if (id && isObjectId(id)) return PurchaseReturn.find({ tenant: ctx.tid, _id: id }).lean();
  const supplier = url.searchParams.get("supplier");
  if (supplier && isObjectId(supplier)) query.supplier = supplier;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ returnNo: rx }, { purchaseNo: rx }, { supplierName: rx }];
  }
  return PurchaseReturn.find(query).sort({ createdAt: -1 }).limit(500).lean();
});
