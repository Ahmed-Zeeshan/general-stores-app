import { z } from "zod";
import { handle, requireUser } from "@/lib/api";
import { Settings } from "@/models";

export const GET = handle(async () => {
  await requireUser();
  return Settings.findOne({ key: "shop" }).lean();
});

const Body = z.object({
  shopName: z.string().trim().min(2),
  shopType: z.enum(["karyana", "general", "bakery", "other"]),
  ownerName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  ntn: z.string().trim().optional(),
  strn: z.string().trim().optional(),
  taxEnabled: z.boolean(),
  taxRate: z.coerce.number().min(0).max(100),
  pricesIncludeTax: z.boolean(),
  receiptFooter: z.string().trim().max(200).optional(),
});

export const PUT = handle(async (req) => {
  await requireUser(["owner"]);
  const body = Body.parse(await req.json());
  return Settings.findOneAndUpdate({ key: "shop" }, body, { new: true, upsert: true }).lean();
});
