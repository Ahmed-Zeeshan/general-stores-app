import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { moveStock } from "@/lib/services";
import { Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  mode: z.enum(["add", "remove", "wastage", "set"]),
  qty: z.coerce.number().min(0),
  note: z.string().trim().optional(),
});

/** Stock adjustment at the current branch. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const { mode, qty, note } = Body.parse(await req.json());
  const product = await Product.findOne({ _id: id, tenant: tid }).lean();
  if (!product) throw new ApiError(404, "Product not found.");
  const current = (await branchStock(tid, branchId, [product._id])).get(String(product._id)) ?? 0;

  let delta = qty;
  if (mode === "remove" || mode === "wastage") delta = -qty;
  if (mode === "set") delta = qty - current;
  if (Math.abs(delta) < 0.0005) return { ...product, stock: current };

  const moved = await moveStock({
    tid,
    branch: branchId,
    productId: id,
    qty: delta,
    type: mode === "wastage" ? "wastage" : "adjustment",
    note: note || (mode === "set" ? "Stock count correction" : undefined),
    userId: user.id,
  });
  return { ...moved!.product.toObject(), totalStock: moved!.product.stock, stock: moved!.branchQty };
});
