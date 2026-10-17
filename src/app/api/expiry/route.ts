import { addDays, handle } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { daysUntil } from "@/lib/batches";
import { round2 } from "@/lib/money";
import { Branch, Product, StockBatch } from "@/models";

/**
 * Stock by expiry date: batches of products with "track expiry", plus products that only have a
 * single expiry date. ?within=7|30|90|all (days ahead; expired is always included).
 */
export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { tid } = ctx;
  const url = new URL(req.url);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  const within = url.searchParams.get("within") ?? "30";
  const now = new Date();
  const until = within === "all" ? null : addDays(now, Number(within) || 30);
  const dateFilter = until ? { $ne: null, $lte: until } : { $ne: null };

  const [batches, simple, branches] = await Promise.all([
    StockBatch.find({ tenant: tid, qty: { $gt: 0.0005 }, expiryDate: dateFilter, ...(branch ? { branch } : {}) }).sort({ expiryDate: 1 }).limit(3000).lean(),
    Product.find({ tenant: tid, active: true, trackExpiry: { $ne: true }, stock: { $gt: 0 }, expiryDate: dateFilter }).select("name unit costPrice stock expiryDate").lean(),
    Branch.find({ tenant: tid }).select("name").lean(),
  ]);
  const products = await Product.find({ tenant: tid, _id: { $in: [...new Set(batches.map((b) => String(b.product)))] } }).select("name unit costPrice").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const daysLeft = (d: Date) => daysUntil(d, now);

  const rows = [
    ...batches.map((b) => {
      const p = byId.get(String(b.product));
      const cost = b.cost || p?.costPrice || 0;
      return {
        _id: String(b._id),
        kind: "batch" as const,
        product: String(b.product),
        name: p?.name ?? "—",
        unit: p?.unit ?? "",
        branch: String(b.branch),
        branchName: branchName.get(String(b.branch)) ?? "",
        qty: b.qty,
        expiryDate: b.expiryDate!,
        daysLeft: daysLeft(b.expiryDate!),
        batchNo: b.batchNo,
        refNo: b.refNo,
        sourceType: b.sourceType,
        sourceId: b.sourceId ? String(b.sourceId) : undefined,
        value: round2(b.qty * cost),
      };
    }),
    // Products without batches: their single expiry date and shop-wide stock.
    ...(branch && ctx.branches.length > 1
      ? []
      : simple.map((p) => ({
          _id: String(p._id),
          kind: "product" as const,
          product: String(p._id),
          name: p.name,
          unit: p.unit,
          branch: "",
          branchName: "",
          qty: p.stock,
          expiryDate: p.expiryDate!,
          daysLeft: daysLeft(p.expiryDate!),
          batchNo: undefined,
          refNo: undefined,
          value: round2(p.stock * (p.costPrice ?? 0)),
        }))),
  ].sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  const sum = (f: (r: (typeof rows)[number]) => boolean) => {
    const list = rows.filter(f);
    return { count: list.length, value: round2(list.reduce((a, r) => a + r.value, 0)) };
  };
  return {
    rows,
    summary: { expired: sum((r) => r.daysLeft < 0), week: sum((r) => r.daysLeft >= 0 && r.daysLeft <= 7), month: sum((r) => r.daysLeft > 7 && r.daysLeft <= 30) },
  };
});
