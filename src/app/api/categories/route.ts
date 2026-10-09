import { z } from "zod";
import { handle, requireUser } from "@/lib/api";
import { Category } from "@/models";

export const GET = handle(async () => {
  await requireUser();
  return Category.find().sort({ name: 1 }).lean();
});

const Body = z.object({ name: z.string().trim().min(1, "Name is required"), color: z.string().optional() });

export const POST = handle(async (req) => {
  await requireUser(["owner", "manager"]);
  return Category.create(Body.parse(await req.json()));
});
