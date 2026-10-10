import { z } from "zod";
import { ApiError, handle, requireTenant } from "@/lib/api";
import { Category, Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ name: z.string().trim().min(1), color: z.string().optional() });

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const cat = await Category.findOneAndUpdate({ _id: id, tenant: tid }, Body.parse(await req.json()), { new: true }).lean();
  if (!cat) throw new ApiError(404, "Category not found.");
  return cat;
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  await Product.updateMany({ tenant: tid, category: id }, { $unset: { category: 1 } });
  await Category.deleteOne({ _id: id, tenant: tid });
  return { ok: true };
});
