import { z } from "zod";
import { escapeRegex, handle } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { withCategories } from "@/lib/categories";
import { assertBarcodesFree } from "@/lib/barcode-server";
import { ProductInput } from "@/lib/schemas";
import { moveStock } from "@/lib/services";
import { Product } from "@/models";

/**
 * Products with `stock` = stock at the current branch (or the shop total with ?branch=all)
 * and `totalStock` = all branches together.
 */
export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const { tid } = ctx;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category");
  const filter = url.searchParams.get("filter"); // low | expiring | inactive
  const allBranches = url.searchParams.get("branch") === "all" && !ctx.locked && ctx.user.role !== "cashier";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 5000);

  const query: Record<string, unknown> = { tenant: tid, active: filter === "inactive" ? false : true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ name: rx }, { nameUrdu: rx }, { barcode: q }, { "packs.barcode": q }, { sku: rx }];
  }
  if (category) query.category = category;
  if (filter === "expiring") {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    query.expiryDate = { $ne: null, $lte: soon };
  }
  const products = await Product.find(query).sort({ name: 1 }).limit(limit).lean();
  const levels = allBranches ? null : await branchStock(tid, ctx.branchId, products.map((p) => p._id));
  let rows = products.map((p) => ({ ...p, totalStock: p.stock, stock: levels ? levels.get(String(p._id)) ?? 0 : p.stock }));
  if (filter === "low") rows = rows.filter((p) => p.stock <= p.lowStockAlert);
  return withCategories(tid, rows);
});

export const POST = handle(async (req) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const raw = await req.json();
  const body = ProductInput.parse(raw);
  const openingStock = z.coerce.number().min(0).optional().parse(raw.openingStock) ?? 0;
  await assertBarcodesFree(tid, body);
  const product = await Product.create({ ...body, tenant: tid, barcode: body.barcode || undefined, wholesalePrice: body.wholesalePrice ?? undefined, stock: 0 });
  if (openingStock > 0) {
    await moveStock({ tid, branch: branchId, productId: product._id, qty: openingStock, type: "opening", note: "Opening stock", userId: user.id });
  }
  return Product.findOne({ _id: product._id, tenant: tid }).lean();
});
