import { handle, requireTenant } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { recipesWithDetails, RecipeInput, validateRecipe } from "@/lib/recipes";
import { Recipe } from "@/models";

export const GET = handle(async () => {
  const { tid, branchId } = await requireBranch(["owner", "manager"]);
  return recipesWithDetails(tid, branchId);
});

export const POST = handle(async (req) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const body = RecipeInput.parse(await req.json());
  await validateRecipe(tid, body);
  return Recipe.create({ ...body, tenant: tid });
});
