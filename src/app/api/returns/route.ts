import { dateRange, escapeRegex, handle, isObjectId } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { SaleReturn } from "@/models";

/** Returns made in a period (newest first). */
export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 0);
  const query: Record<string, unknown> = { tenant: ctx.tid, createdAt: { $gte: from, $lte: to } };
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  if (branch) query.branch = branch;
  const shift = url.searchParams.get("shift");
  if (shift && isObjectId(shift)) query.shift = shift;
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ returnNo: rx }, { invoiceNo: rx }, { customerName: rx }];
  }
  return SaleReturn.find(query).sort({ createdAt: -1 }).limit(1000).lean();
});
