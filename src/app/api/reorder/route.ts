import { z } from "zod";
import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { reorderList } from "@/lib/reorder";

/** Items to order for this branch, grouped by supplier (?days= how many days the order should cover). */
export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const days = z.coerce.number().int().min(3).max(90).catch(14).parse(new URL(req.url).searchParams.get("days") ?? 14);
  return { days, groups: await reorderList(ctx, days) };
});
