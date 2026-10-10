import { handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { promoDescription, PromotionInput } from "@/lib/promotion-input";
import { Promotion } from "@/models";

/** All offers (the POS uses them to show discounts before saving). */
export const GET = handle(async () => {
  const { tid } = await requireTenant();
  return Promotion.find({ tenant: tid }).sort({ active: -1, createdAt: -1 }).lean();
});

export const POST = handle(async (req) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const body = PromotionInput.parse(await req.json());
  const promo = await Promotion.create({ ...body, tenant: tid });
  await logActivity({ tid, user }, { action: "promo.create", summary: `New offer "${body.name}": ${promoDescription(body)}`, refType: "promotion", refId: promo._id });
  return promo.toObject();
});
