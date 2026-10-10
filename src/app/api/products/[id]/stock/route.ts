import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { moveStock } from "@/lib/services";
import { Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  mode: z.enum(["add", "remove", "wastage", "set"]),
  qty: z.coerce.number().min(0),
  note: z.string().trim().optional(),
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const { mode, qty, note } = Body.parse(await req.json());
  const current = await Product.findOne({ _id: id, tenant: tid }).lean();
  if (!current) throw new ApiError(404, "Product not found.");

  let delta = qty;
  if (mode === "remove" || mode === "wastage") delta = -qty;
  if (mode === "set") delta = qty - current.stock;
  if (delta === 0) return current;

  return moveStock({
    tid,
    productId: id,
    qty: delta,
    type: mode === "wastage" ? "wastage" : "adjustment",
    note: note || (mode === "set" ? "Stock count correction" : undefined),
    userId: user.id,
  });
});
