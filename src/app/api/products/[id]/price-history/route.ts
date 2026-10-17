import { ApiError, handle, requireTenant } from "@/lib/api";
import { PriceChange, Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** Every price change of one item, newest first (cashiers do not see cost prices). */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid, user } = await requireTenant();
  const { id } = await params;
  const product = await Product.findOne({ _id: id, tenant: tid }).select("name unit salePrice wholesalePrice costPrice").lean();
  if (!product) throw new ApiError(404, "Product not found.");
  const cashier = user.role === "cashier";
  const rows = await PriceChange.find({ tenant: tid, product: id, ...(cashier ? { field: { $ne: "costPrice" } } : {}) })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  return {
    product: { _id: product._id, name: product.name, unit: product.unit, salePrice: product.salePrice, wholesalePrice: product.wholesalePrice, ...(cashier ? {} : { costPrice: product.costPrice }) },
    rows: rows.map((r) => ({ _id: r._id, field: r.field, from: r.from, to: r.to, source: r.source, refNo: r.refNo, refId: r.refId, userName: r.userName, at: r.createdAt })),
  };
});
