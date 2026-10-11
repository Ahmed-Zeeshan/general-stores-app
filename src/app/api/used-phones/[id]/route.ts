import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { Device, UsedPurchase } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** One used-phone purchase with photos and the phone's current status. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const doc = await UsedPurchase.findOne({ _id: id, tenant: tid }).lean();
  if (!doc) throw new ApiError(404, "Not found.");
  const device = doc.device ? await Device.findOne({ _id: doc.device, tenant: tid }).select("status sale").lean() : null;
  return { ...doc, deviceStatus: device?.status, deviceSale: device?.sale };
});
