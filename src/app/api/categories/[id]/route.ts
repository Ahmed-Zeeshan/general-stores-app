import { z } from "zod";
import { ApiError, handle, requireUser } from "@/lib/api";
import { Category, Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ name: z.string().trim().min(1), color: z.string().optional() });

export const PUT = handle<Ctx>(async (req, { params }) => {
  await requireUser(["owner", "manager"]);
  const { id } = await params;
  const cat = await Category.findByIdAndUpdate(id, Body.parse(await req.json()), { new: true }).lean();
  if (!cat) throw new ApiError(404, "Category not found.");
  return cat;
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  await requireUser(["owner", "manager"]);
  const { id } = await params;
  await Product.updateMany({ category: id }, { $unset: { category: 1 } });
  await Category.findByIdAndDelete(id);
  return { ok: true };
});
