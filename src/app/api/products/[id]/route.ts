import { ApiError, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { branchStock, requireBranch } from "@/lib/branches";
import { withCategories } from "@/lib/categories";
import { assertBarcodesFree } from "@/lib/barcode-server";
import { ProductInput } from "@/lib/schemas";
import { startBatches } from "@/lib/batches";
import { Product, StockLevel, StockMovement } from "@/models";
import { recordPriceChanges } from "@/lib/price-history";

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
  return { product: withCat, byBranch, movements };
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
