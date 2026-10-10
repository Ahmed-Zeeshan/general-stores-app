import { z } from "zod";
import { ApiError, dateRange, handle } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { recipesWithDetails } from "@/lib/recipes";
import { moveStock } from "@/lib/services";
import { nextNumber, Product, Production } from "@/models";

export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 29);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  return Production.find({ tenant: ctx.tid, createdAt: { $gte: from, $lte: to }, ...(branch ? { branch } : {}) }).sort({ createdAt: -1 }).limit(500).lean();
});

const Body = z.object({
  recipeId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose a recipe"),
  batches: z.coerce.number().positive("Batches must be more than zero").max(10000),
  /** Set the output item's cost price to this run's cost per unit. */
  updateCost: z.boolean().default(true),
  allowShortage: z.boolean().default(false),
  note: z.string().trim().optional(),
});

/** Records a production run: consumes ingredients from stock and adds the finished item to stock. */
export const POST = handle(async (req) => {
  const { user, tid, branchId, branch } = await requireBranch(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const [recipe] = await recipesWithDetails(tid, branchId, { _id: body.recipeId });
  if (!recipe || !recipe.outputProduct) throw new ApiError(404, "Recipe not found.");

  const used = recipe.ingredients.map((i) => ({
    product: i.product,
    name: i.name,
    unit: i.unit,
    qty: Math.round(i.qty * body.batches * 1000) / 1000,
    cost: round2(i.qty * body.batches * i.costPrice),
    stock: i.stock,
  }));
  const short = used.filter((u) => u.stock < u.qty);
  if (short.length && !body.allowShortage) {
    throw new ApiError(400, `Not enough stock: ${short.map((s) => `${s.name} (need ${s.qty}, have ${s.stock})`).join(", ")}.`);
  }

  const outputQty = Math.round(recipe.outputQty * body.batches * 1000) / 1000;
  const totalCost = round2(used.reduce((s, u) => s + u.cost, 0));
  const unitCost = outputQty ? round2(totalCost / outputQty) : 0;
  const productionNo = await nextNumber(tid, "production", "PRD");

  const run = await Production.create({
    tenant: tid,
    productionNo,
    branch: branchId,
    branchName: branch.name,
    recipe: recipe._id,
    recipeName: recipe.name,
    output: recipe.output,
    outputName: recipe.outputProduct.name,
    outputUnit: recipe.outputProduct.unit,
    batches: body.batches,
    outputQty,
    ingredients: used.map((u) => ({ product: u.product, name: u.name, unit: u.unit, qty: u.qty, cost: u.cost })),
    totalCost,
    unitCost,
    note: body.note,
    user: user.id,
    userName: user.name,
  });

  for (const u of used) {
    await moveStock({ tid, branch: branchId, productId: u.product, qty: -u.qty, type: "production", refNo: productionNo, note: `Used in ${recipe.name}`, userId: user.id });
  }
  await moveStock({ tid, branch: branchId, productId: recipe.output, qty: outputQty, type: "production", refNo: productionNo, note: `Made from ${recipe.name}`, userId: user.id });
  if (body.updateCost && unitCost > 0) {
    await Product.updateOne({ _id: recipe.output, tenant: tid }, { costPrice: unitCost });
  }
  return run.toObject();
});
