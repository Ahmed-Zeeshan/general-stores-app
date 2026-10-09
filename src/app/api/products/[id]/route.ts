import { ApiError, handle, requireUser } from "@/lib/api";
import { ProductInput } from "@/lib/schemas";
import { Product, StockMovement } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireUser();
  const { id } = await params;
  const product = await Product.findById(id).populate("category", "name").lean();
  if (!product) throw new ApiError(404, "Product not found.");
  const movements = await StockMovement.find({ product: id }).sort({ createdAt: -1 }).limit(50).lean();
  return { product, movements };
});

export const PUT = handle<Ctx>(async (req, { params }) => {
  await requireUser(["owner", "manager"]);
  const { id } = await params;
  const body = ProductInput.parse(await req.json());
  if (body.barcode && (await Product.exists({ barcode: body.barcode, _id: { $ne: id } }))) {
    throw new ApiError(409, `Barcode ${body.barcode} is already used by another product.`);
  }
  const update: Record<string, unknown> = { ...body };
  const unset: Record<string, 1> = {};
  if (!body.barcode) {
    delete update.barcode;
    unset.barcode = 1;
  }
  if (!body.category) {
    delete update.category;
    unset.category = 1;
  }
  const product = await Product.findByIdAndUpdate(id, { $set: update, $unset: unset }, { new: true, runValidators: true }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  return product;
});

/** Soft delete so old bills still show the product. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  await requireUser(["owner", "manager"]);
  const { id } = await params;
  await Product.findByIdAndUpdate(id, { active: false });
  return { ok: true };
});
