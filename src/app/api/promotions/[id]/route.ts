import { ApiError, handle, requireTenant } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { Promotion } from "@/models";
import { promoDescription, PromotionInput } from "@/lib/promotion-input";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const body = PromotionInput.parse(await req.json());
  const promo = await Promotion.findOneAndUpdate({ _id: id, tenant: tid }, { $set: body, ...(body.startsAt ? {} : { $unset: { startsAt: 1 } }) }, { new: true }).lean();
  if (!promo) throw new ApiError(404, "Offer not found.");
  if (!body.endsAt) await Promotion.updateOne({ _id: id, tenant: tid }, { $unset: { endsAt: 1 } });
  await logActivity({ tid, user }, { action: "promo.update", summary: `Offer "${body.name}" ${body.active ? "updated" : "switched off"}: ${promoDescription(body)}`, refType: "promotion", refId: promo._id });
  return Promotion.findOne({ _id: id, tenant: tid }).lean();
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const { tid, user } = await requireTenant(["owner", "manager"]);
  const { id } = await params;
  const promo = await Promotion.findOneAndDelete({ _id: id, tenant: tid }).lean();
  if (!promo) throw new ApiError(404, "Offer not found.");
  await logActivity({ tid, user }, { action: "promo.delete", summary: `Deleted offer "${promo.name}"`, refType: "promotion" });
  return { ok: true };
});
