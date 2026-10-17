import { dateRange, escapeRegex, handle, isObjectId } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { createSale, SaleBody } from "@/lib/sales";
import { Sale } from "@/models";

export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 0);
  const q = url.searchParams.get("q")?.trim();
  const query: Record<string, unknown> = { tenant: ctx.tid, createdAt: { $gte: from, $lte: to } };
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  if (branch) query.branch = branch;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ invoiceNo: rx }, { customerName: rx }];
  }
  const method = url.searchParams.get("method");
  if (method) {
    const byMethod = method === "credit" ? { creditAmount: { $gt: 0 } } : { $or: [{ paymentMethod: method }, { "payments.method": method }] };
    query.$and = [...((query.$and as unknown[]) ?? []), byMethod];
  }
  // One cash drawer session's bills (from the Cash Drawer page).
  const shift = url.searchParams.get("shift");
  if (shift && isObjectId(shift)) query.shift = shift;
  const status = url.searchParams.get("status");
  if (status === "returned" || status === "partially_returned") query.status = status;
  else if (status === "udhaar") query.creditAmount = { $gt: 0 };
  else if (status === "corrected") query["correctedBy.invoiceNo"] = { $exists: true };
  const fbr = url.searchParams.get("fbr");
  if (fbr) query.fbrStatus = fbr;
  // Cashiers do not get the shop's cost prices.
  return Sale.find(query).sort({ createdAt: -1 }).limit(1000).select(ctx.user.role === "cashier" ? "-costTotal -items.cost" : "").lean();
});

export const POST = handle(async (req) => {
  const ctx = await requireBranch();
  return createSale(ctx, SaleBody.parse(await req.json()));
});
