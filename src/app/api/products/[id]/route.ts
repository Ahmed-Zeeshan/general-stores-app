import { ApiError, handle, requireTenant } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { withCategories } from "@/lib/categories";
import { ProductInput } from "@/lib/schemas";
import { Product, StockLevel, StockMovement } from "@/models";

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
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const body = ProductInput.parse(await req.json());
  if (body.barcode && (await Product.exists({ tenant: tid, barcode: body.barcode, _id: { $ne: id } }))) {
    throw new ApiError(409, `Barcode ${body.barcode} is already used by another product.`);
  }
  const update: Record<string, unknown> = { ...body };
  const unset: Record<string, 1> = {};
  for (const key of ["barcode", "category", "pctCode"] as const) {
    if (!body[key]) {
      delete update[key];
      unset[key] = 1;
    }
  }
  const product = await Product.findOneAndUpdate({ _id: id, tenant: tid }, { $set: update, $unset: unset }, { new: true, runValidators: true }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  return product;
});

/** Soft delete so old bills still show the product. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  await Product.updateOne({ _id: id, tenant: tid }, { active: false });
  return { ok: true };
});
