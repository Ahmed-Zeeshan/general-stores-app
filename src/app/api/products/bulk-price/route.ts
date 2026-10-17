import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { recordPriceChanges } from "@/lib/price-history";
import { Category, Product } from "@/models";

const Body = z.object({
  /** Which items: all, one category, or the ones chosen. */
  scope: z.enum(["all", "category", "ids"]),
  categoryId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  productIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(5000).optional(),
  field: z.enum(["salePrice", "wholesalePrice"]),
  /** percent: +5 = 5% more, −10 = 10% less. amount: Rs per loose unit (+20 / −5). */
  mode: z.enum(["percent", "amount"]),
  value: z.coerce.number().refine((v) => v !== 0, "Enter how much to change the price").refine((v) => Math.abs(v) <= 100_000, "That change is too large"),
  /** Round the new price to the nearest 1, 5 or 10 rupees (0 = to the paisa). */
  round: z.coerce.number().refine((v) => [0, 1, 5, 10].includes(v)).default(0),
  /** true = only show what would change. */
  preview: z.boolean().default(false),
});

const roundTo = (n: number, step: number) => (step ? Math.round(n / step) * step : round2(n));

/** Raise or lower many prices at once (owner / manager), e.g. all "Oil & Ghee" sale prices by 5%. */
export const POST = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { tid, user } = ctx;
  const b = Body.parse(await req.json());
  if (b.mode === "percent" && b.value <= -100) throw new ApiError(400, "A price cannot go down by 100% or more.");
  const query: Record<string, unknown> = { tenant: tid, active: true };
  let scopeName = "all items";
  if (b.scope === "category") {
    if (!b.categoryId) throw new ApiError(400, "Choose the category.");
    const cat = await Category.findOne({ _id: b.categoryId, tenant: tid }).select("name").lean();
    if (!cat) throw new ApiError(400, "Category not found.");
    query.category = cat._id;
    scopeName = cat.name;
  } else if (b.scope === "ids") {
    if (!b.productIds?.length) throw new ApiError(400, "Choose the items.");
    query._id = { $in: b.productIds };
    scopeName = `${b.productIds.length} chosen items`;
  }
  if (b.field === "wholesalePrice") query.wholesalePrice = { $gt: 0 };
  const products = await Product.find(query).select("name unit salePrice wholesalePrice costPrice packs").sort({ name: 1 }).lean();

  const change = (old: number, perUnits = 1) => (b.mode === "percent" ? old * (1 + b.value / 100) : old + b.value * perUnits);
  const rows = products.map((p) => {
    const from = (p[b.field] as number | undefined) ?? 0;
    const to = roundTo(change(from), b.round);
    const belowCost = (p.costPrice ?? 0) > 0 && to < (p.costPrice ?? 0);
    return { _id: String(p._id), name: p.name, unit: p.unit, from, to, belowCost, skip: !(to > 0) };
  });
  const changing = rows.filter((r) => !r.skip && Math.abs(r.to - r.from) >= 0.005);
  if (b.preview) {
    return { scope: scopeName, total: rows.length, changing: changing.length, belowCost: changing.filter((r) => r.belowCost).length, skipped: rows.filter((r) => r.skip).length, rows: rows.slice(0, 500) };
  }
  if (!changing.length) throw new ApiError(400, "No prices change with these settings.");

  const packKey = b.field === "salePrice" ? "price" : "wholesalePrice";
  const byId = new Map(products.map((p) => [String(p._id), p]));
  for (const r of changing) {
    const p = byId.get(r._id)!;
    const set: Record<string, unknown> = { [b.field]: r.to };
    // Packs with their own price move the same way (an amount counts per loose unit in the pack).
    if (p.packs?.some((k) => (k[packKey] ?? 0) > 0)) {
      set.packs = p.packs.map((k) => ((k[packKey] ?? 0) > 0 ? { ...k, [packKey]: Math.max(0.01, roundTo(change(k[packKey]!, k.size), b.round)) } : k));
    }
    await Product.updateOne({ _id: p._id, tenant: tid }, { $set: set });
    await recordPriceChanges({ tid, user }, p._id, { [b.field]: r.from }, { [b.field]: r.to }, "bulk");
  }
  const how = b.mode === "percent" ? `${b.value > 0 ? "+" : ""}${b.value}%` : `${b.value > 0 ? "+" : "−"}Rs ${Math.abs(b.value)}`;
  await logActivity(
    { tid, user, branchId: ctx.branchId },
    { action: "product.price", summary: `Bulk price change: ${scopeName} — ${b.field === "salePrice" ? "sale" : "wholesale"} prices ${how}${b.round ? `, rounded to Rs ${b.round}` : ""} (${changing.length} items)` },
  );
  return { changed: changing.length };
});
