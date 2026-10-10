import { ApiError, handle, requireTenant } from "@/lib/api";
import { withCategories } from "@/lib/categories";
import { ProductInput } from "@/lib/schemas";
import { Product, StockMovement } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant();
  const { id } = await params;
  const product = await Product.findOne({ _id: id, tenant: tid }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  const movements = await StockMovement.find({ tenant: tid, product: id }).sort({ createdAt: -1 }).limit(50).lean();
  const [withCat] = await withCategories(tid, [product]);
  return { product: withCat, movements };
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
