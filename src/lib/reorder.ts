import { Types } from "mongoose";
import { branchStock, type BranchContext } from "./branches";
import { round2 } from "./money";
import { Party, Product, Purchase, Sale } from "@/models";

export type ReorderRow = {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  perDay: number;
  daysLeft: number | null;
  suggest: number;
  lastCost: number;
  value: number;
  reason: "selling" | "low";
};
export type ReorderGroup = { supplier: { _id: string; name: string; phone?: string } | null; rows: ReorderRow[]; value: number };

const DAY = 864e5;

/**
 * What to order: for every item, how fast it sold in the last `lookback` days at this branch, how many
 * days the stock will last, and how much to order to cover `cover` days. Items that don't sell but are
 * at their low-stock level are listed too. Grouped by the supplier it was last bought from.
 */
export async function reorderList(ctx: BranchContext, cover = 14, lookback = 30, now = new Date()): Promise<ReorderGroup[]> {
  const { tid, branchId } = ctx;
  const since = new Date(now.getTime() - lookback * DAY);
  const [products, sold, purchases] = await Promise.all([
    Product.find({ tenant: tid, active: true }).select("name unit lowStockAlert costPrice trackSerial").lean(),
    Sale.aggregate([
      { $match: { tenant: tid, branch: branchId, createdAt: { $gte: since } } },
      { $unwind: "$items" },
      { $match: { "items.product": { $ne: null } } },
      { $group: { _id: "$items.product", qty: { $sum: { $subtract: ["$items.qty", { $ifNull: ["$items.returnedQty", 0] }] } } } },
    ]),
    Purchase.aggregate([
      { $match: { tenant: tid, status: { $ne: "void" } } },
      { $sort: { createdAt: -1 } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", supplier: { $first: "$supplier" }, cost: { $first: "$items.cost" } } },
    ]),
  ]);
  const soldBy = new Map(sold.map((s) => [String(s._id), Math.max(0, s.qty as number)]));
  const lastBuy = new Map(purchases.map((p) => [String(p._id), p as { supplier?: Types.ObjectId; cost: number }]));
  const levels = await branchStock(tid, branchId, products.map((p) => p._id));

  const rows: (ReorderRow & { supplierId: string | null })[] = [];
  for (const p of products) {
    const id = String(p._id);
    const stock = levels.get(id) ?? 0;
    const perDay = (soldBy.get(id) ?? 0) / lookback;
    const daysLeft = perDay > 0 ? Math.floor(stock / perDay) : null;
    const wholeUnits = p.unit === "pcs" || p.unit === "dozen" || p.unit === "pack" || p.unit === "box" || p.unit === "carton" || p.trackSerial;
    const round = (n: number) => (wholeUnits ? Math.ceil(n) : Math.ceil(n * 10) / 10);
    let suggest = 0;
    let reason: ReorderRow["reason"] = "selling";
    if (perDay > 0 && stock < perDay * cover) suggest = round(perDay * cover - stock);
    else if (perDay === 0 && p.lowStockAlert > 0 && stock <= p.lowStockAlert) {
      suggest = round(p.lowStockAlert * 2 - stock);
      reason = "low";
    }
    if (suggest <= 0) continue;
    const buy = lastBuy.get(id);
    const lastCost = buy?.cost ?? p.costPrice ?? 0;
    rows.push({ productId: id, name: p.name, unit: p.unit, stock: round2(stock), perDay: round2(perDay), daysLeft, suggest, lastCost, value: round2(suggest * lastCost), reason, supplierId: buy?.supplier ? String(buy.supplier) : null });
  }
  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter(Boolean))] as string[];
  const suppliers = await Party.find({ tenant: tid, _id: { $in: supplierIds } }).select("name phone").lean();
  const sup = new Map(suppliers.map((s) => [String(s._id), { _id: String(s._id), name: s.name, phone: s.phone ?? undefined }]));
  const groups = new Map<string, ReorderGroup>();
  // Soonest to run out first.
  rows.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || b.value - a.value);
  for (const { supplierId, ...r } of rows) {
    const key = supplierId && sup.has(supplierId) ? supplierId : "";
    const g = groups.get(key) ?? { supplier: key ? sup.get(key)! : null, rows: [], value: 0 };
    g.rows.push(r);
    g.value = round2(g.value + r.value);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || b.value - a.value);
}
