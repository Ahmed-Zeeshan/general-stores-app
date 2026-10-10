import { z } from "zod";
import type { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import { round2 } from "@/lib/money";
import { Product, Recipe, StockLevel } from "@/models";

export const RecipeInput = z.object({
  name: z.string().trim().min(1, "Recipe name is required"),
  output: z.string().regex(/^[a-f0-9]{24}$/i, "Choose the item this recipe makes"),
  outputQty: z.coerce.number().positive("Batch size must be more than zero"),
  ingredients: z
    .array(z.object({ product: z.string().regex(/^[a-f0-9]{24}$/i), qty: z.coerce.number().positive("Ingredient quantity must be more than zero") }))
    .min(1, "Add at least one ingredient"),
  notes: z.string().trim().optional(),
});

/** Checks every product in a recipe belongs to this shop and the output is not also an ingredient. */
export async function validateRecipe(tid: Types.ObjectId, body: z.infer<typeof RecipeInput>) {
  const ids = [body.output, ...body.ingredients.map((i) => i.product)];
  if (body.ingredients.some((i) => i.product === body.output)) throw new ApiError(400, "An item cannot be an ingredient of itself.");
  if (new Set(body.ingredients.map((i) => i.product)).size !== body.ingredients.length) {
    throw new ApiError(400, "The same ingredient is listed twice.");
  }
  const found = await Product.countDocuments({ tenant: tid, _id: { $in: ids } });
  if (found !== new Set(ids).size) throw new ApiError(400, "One of the items no longer exists. Please refresh.");
}

/** Recipes with product details, stock at the given branch and the current cost of one batch. */
export async function recipesWithDetails(tid: Types.ObjectId, branch: Types.ObjectId, filter: Record<string, unknown> = {}) {
  const recipes = await Recipe.find({ tenant: tid, active: true, ...filter }).sort({ name: 1 }).lean();
  const ids = recipes.flatMap((r) => [r.output, ...r.ingredients.map((i) => i.product)]);
  const products = await Product.find({ tenant: tid, _id: { $in: ids } }).select("name unit costPrice salePrice stock").lean();
  const levels = await StockLevel.find({ tenant: tid, branch, product: { $in: ids } }).select("product qty").lean();
  const qty = new Map(levels.map((l) => [String(l.product), l.qty]));
  const byId = new Map(products.map((p) => [String(p._id), { ...p, stock: qty.get(String(p._id)) ?? 0 }]));
  return recipes.map((r) => {
    const ingredients = r.ingredients.map((i) => {
      const p = byId.get(String(i.product));
      return { product: i.product, qty: i.qty, name: p?.name ?? "(deleted)", unit: p?.unit ?? "", stock: p?.stock ?? 0, costPrice: p?.costPrice ?? 0 };
    });
    const batchCost = round2(ingredients.reduce((s, i) => s + i.qty * i.costPrice, 0));
    const out = byId.get(String(r.output));
    return {
      ...r,
      outputProduct: out ? { _id: out._id, name: out.name, unit: out.unit, salePrice: out.salePrice, stock: out.stock } : null,
      ingredients,
      batchCost,
      unitCost: r.outputQty ? round2(batchCost / r.outputQty) : 0,
    };
  });
}
