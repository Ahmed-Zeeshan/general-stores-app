import { z } from "zod";
import { ApiError, escapeRegex, handle } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { withCategories } from "@/lib/categories";
import { assertBarcodesFree } from "@/lib/barcode-server";
import { ProductInput } from "@/lib/schemas";
import { batchExpiry } from "@/lib/batches";
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
    // Every word must be in the name, brand or "fits" models ("cover a54"); barcodes match exactly.
    const words = q.split(/\s+/).map((w) => new RegExp(escapeRegex(w), "i"));
    query.$or = [{ barcode: q }, { "packs.barcode": q }, { $and: words.map((rx) => ({ $or: [{ name: rx }, { nameUrdu: rx }, { brand: rx }, { fits: rx }, { sku: rx }] })) }];
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
  if (body.trackSerial) {
    if (openingStock > 0) throw new ApiError(400, "Phones tracked by IMEI start with no stock. Save the product, then add each phone with its IMEI (Phones → Add phones, or a purchase).");
    if (body.packs?.length) throw new ApiError(400, "Phones tracked by IMEI are sold one piece at a time, so they cannot have pack sizes.");
    if (body.unit !== "pcs") throw new ApiError(400, "Phones tracked by IMEI must use the unit Piece.");
  }
  const product = await Product.create({
    ...body,
    tenant: tid,
    barcode: body.barcode || undefined,
    wholesalePrice: body.wholesalePrice ?? undefined,
    warrantyMonths: body.warrantyMonths ?? undefined,
    stock: 0,
  });
  if (openingStock > 0) {
    await moveStock({
      tid,
      branch: branchId,
      productId: product._id,
      qty: openingStock,
      type: "opening",
      note: "Opening stock",
      userId: user.id,
      batch: { incoming: [{ expiryDate: batchExpiry(body.expiryDate ?? null, body.shelfLifeDays) }], source: { type: "opening" } },
    });
  }
  return Product.findOne({ _id: product._id, tenant: tid }).lean();
});
