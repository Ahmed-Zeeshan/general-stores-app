import { z } from "zod";
import { handle, requireTenant } from "@/lib/api";
import { Category } from "@/models";

export const GET = handle(async () => {
  const { tid } = await requireTenant();
  return Category.find({ tenant: tid }).sort({ name: 1 }).lean();
});

const Body = z.object({ name: z.string().trim().min(1, "Name is required"), color: z.string().optional() });

export const POST = handle(async (req) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  return Category.create({ ...Body.parse(await req.json()), tenant: tid });
});
