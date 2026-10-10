import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { Purchase, PurchaseReturn } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** One purchase with its returns to the supplier. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const { tid } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const purchase = await Purchase.findOne({ _id: id, tenant: tid }).lean();
  if (!purchase) throw new ApiError(404, "Purchase not found.");
  const returns = await PurchaseReturn.find({ tenant: tid, purchase: purchase._id }).sort({ createdAt: 1 }).lean();
  return { ...purchase, returns };
});
