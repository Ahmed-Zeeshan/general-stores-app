import { handle, requireTenant } from "@/lib/api";
import { recipesWithDetails, RecipeInput, validateRecipe } from "@/lib/recipes";
import { Recipe } from "@/models";

export const GET = handle(async () => {
  const { tid } = await requireTenant(["owner", "manager"]);
  return recipesWithDetails(tid);
});

export const POST = handle(async (req) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const body = RecipeInput.parse(await req.json());
  await validateRecipe(tid, body);
  return Recipe.create({ ...body, tenant: tid });
});
