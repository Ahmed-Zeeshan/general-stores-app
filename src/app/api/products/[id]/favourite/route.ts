import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** Star / unstar an item for the Favourites row on the sale screen (owner / manager). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const { favourite } = z.object({ favourite: z.boolean() }).parse(await req.json());
  const p = await Product.findOneAndUpdate({ _id: id, tenant: tid }, { $set: { favourite } }, { new: true }).select("name favourite").lean();
  if (!p) throw new ApiError(404, "Product not found.");
  return p;
});
