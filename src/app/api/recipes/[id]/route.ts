import { ApiError, handle, requireTenant } from "@/lib/api";
import { Recipe } from "@/models";
import { RecipeInput, validateRecipe } from "@/lib/recipes";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const body = RecipeInput.parse(await req.json());
  await validateRecipe(tid, body);
  const recipe = await Recipe.findOneAndUpdate({ _id: id, tenant: tid }, body, { new: true, runValidators: true }).lean();
  if (!recipe) throw new ApiError(404, "Recipe not found.");
  return recipe;
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  await Recipe.updateOne({ _id: id, tenant: tid }, { active: false });
  return { ok: true };
});
