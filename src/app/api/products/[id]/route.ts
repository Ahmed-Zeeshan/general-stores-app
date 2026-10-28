import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { branchStock, requireBranch } from "@/lib/branches";
import { withCategories } from "@/lib/categories";
import { assertBarcodesFree } from "@/lib/barcode-server";
import { ProductInput } from "@/lib/schemas";
import { startBatches } from "@/lib/batches";
import { Product, StockLevel, StockMovement, User } from "@/models";
import { recordPriceChanges } from "@/lib/price-history";
import { linkMovements } from "@/lib/stock-history";

type Ctx = { params: Promise<{ id: string }> };

/** One product with its stock at the current branch, at every branch, and recent movements. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const ctx = await requireBranch();
  const { tid } = ctx;
  const { id } = await params;
  const product = await Product.findOne({ _id: id, tenant: tid }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  const [movements, levels, here] = await Promise.all([
    StockMovement.find({ tenant: tid, product: id, branch: ctx.branchId }).sort({ createdAt: -1 }).limit(50).lean(),
    StockLevel.find({ tenant: tid, product: id }).select("branch qty").lean(),
    branchStock(tid, ctx.branchId, [product._id]),
  ]);
  const qtyByBranch = new Map(levels.map((l) => [String(l.branch), l.qty]));
  const byBranch = ctx.branches.map((b) => ({ branch: b._id, name: b.name, qty: qtyByBranch.get(String(b._id)) ?? 0 }));
  const [withCat] = await withCategories(tid, [{ ...product, totalStock: product.stock, stock: here.get(String(product._id)) ?? 0 }]);
  // Who made each change (names, not ids).
  const users = await User.find({ tenant: tid, _id: { $in: [...new Set(movements.map((m) => String(m.user)).filter((x) => x !== "undefined"))] } }).select("name").lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const linked = await linkMovements(tid, movements);
  return { product: withCat, byBranch, movements: linked.map((m) => ({ ...m, userName: m.user ? names.get(String(m.user)) : undefined })) };
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const body = ProductInput.parse(await req.json());
  await assertBarcodesFree(tid, body, id);
  const update: Record<string, unknown> = { ...body };
  const unset: Record<string, 1> = {};
  for (const key of ["barcode", "category", "pctCode", "wholesalePrice", "brand", "fits"] as const) {
    if (!body[key]) {
      delete update[key];
      unset[key] = 1;
    }
  }
  if (!body.shelfLifeDays) {
    delete update.shelfLifeDays;
    unset.shelfLifeDays = 1;
  }
  if (!body.warrantyMonths) {
    delete update.warrantyMonths;
    unset.warrantyMonths = 1;
  }
  // Photo: missing = keep it, "" = remove it.
  if (body.image === undefined) delete update.image;
  else if (body.image === "") {
    delete update.image;
    unset.image = 1;
    update.hasImage = false;
  } else update.hasImage = true;
  if (body.favourite === undefined) delete update.favourite;
  const before = await Product.findOne({ _id: id, tenant: tid }).select("trackExpiry trackSerial stock name salePrice costPrice wholesalePrice").lean();
  if (!before) throw new ApiError(404, "Product not found.");
  // IMEI tracking can only be switched while the shop has none of it in stock (stock = the list of phones).
  if (!!body.trackSerial !== !!before.trackSerial) {
    if (body.trackSerial === undefined) delete update.trackSerial;
    else if (Math.abs(before.stock ?? 0) > 0.0005) {
      throw new ApiError(400, body.trackSerial ? `${before.name} has stock (${before.stock}) without IMEIs. Bring its stock to 0 first, then switch on IMEI tracking and add each phone with its IMEI.` : `${before.name} still has phones in stock. Sell, return or remove them before switching off IMEI tracking.`);
    }
  }
  if (body.trackSerial) {
    if (body.packs?.length) throw new ApiError(400, "Phones tracked by IMEI are sold one piece at a time, so they cannot have pack sizes.");
    if (body.unit !== "pcs") throw new ApiError(400, "Phones tracked by IMEI must use the unit Piece.");
  }
  const product = await Product.findOneAndUpdate({ _id: id, tenant: tid }, { $set: update, $unset: unset }, { new: true, runValidators: true }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  if (product.trackExpiry && !before?.trackExpiry) await startBatches(tid, product);
  await recordPriceChanges({ tid, user }, product._id, before, product, "edit");
  const priceChanges = (
    [
      ["sale price", before?.salePrice, product.salePrice],
      ["cost price", before?.costPrice, product.costPrice],
      ["wholesale price", before?.wholesalePrice ?? null, product.wholesalePrice ?? null],
    ] as const
  ).filter(([, a, b]) => (a ?? null) !== (b ?? null));
  if (priceChanges.length) {
    await logActivity(
      { tid, user },
      {
        action: "product.price",
        summary: `${product.name}: ${priceChanges.map(([k, a, b]) => `${k} ${a ?? "—"} → ${b ?? "—"}`).join(", ")}`,
        refType: "product",
        refId: product._id,
      },
    );
  }
  return product;
});

/** Soft delete so old bills still show the product. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const p = await Product.findOneAndUpdate({ _id: id, tenant: tid }, { active: false }).select("name stock").lean();
  if (p) await logActivity({ tid, user }, { action: "product.remove", summary: `Removed product ${p.name} (stock ${p.stock})`, refType: "product", refId: p._id });
  return { ok: true };
});

/** A small inline edit from the Products list: just the sale/cost price or low-stock level. */
const QuickEdit = z
  .object({
    salePrice: z.coerce.number().min(0).max(100_000_000).optional(),
    costPrice: z.coerce.number().min(0).max(100_000_000).optional(),
    lowStockAlert: z.coerce.number().min(0).max(1_000_000).optional(),
    category: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  })
  .refine((b) => b.salePrice !== undefined || b.costPrice !== undefined || b.lowStockAlert !== undefined || b.category !== undefined, "Nothing to change.");

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const b = QuickEdit.parse(await req.json());
  const before = await Product.findOne({ _id: id, tenant: tid }).select("name salePrice costPrice wholesalePrice lowStockAlert category").lean();
  if (!before) throw new ApiError(404, "Product not found.");
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (b.salePrice !== undefined) set.salePrice = b.salePrice;
  if (b.costPrice !== undefined) set.costPrice = b.costPrice;
  if (b.lowStockAlert !== undefined) set.lowStockAlert = b.lowStockAlert;
  if (b.category !== undefined) {
    if (b.category) set.category = b.category;
    else unset.category = 1;
  }
  const product = await Product.findOneAndUpdate({ _id: id, tenant: tid }, { $set: set, $unset: unset }, { new: true, runValidators: true }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  await recordPriceChanges({ tid, user }, product._id, before, product, "edit");
  const priceChanges = (
    [
      ["sale price", before.salePrice, product.salePrice],
      ["cost price", before.costPrice, product.costPrice],
    ] as const
  ).filter(([, a, c]) => (a ?? null) !== (c ?? null));
  if (priceChanges.length) {
    await logActivity(
      { tid, user },
      { action: "product.price", summary: `${product.name}: ${priceChanges.map(([k, a, c]) => `${k} ${a ?? "—"} → ${c ?? "—"}`).join(", ")}`, refType: "product", refId: product._id },
    );
  }
  const [withCat] = await withCategories(tid, [{ ...product, totalStock: product.stock, stock: product.stock }]);
  return withCat;
});
