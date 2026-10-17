import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { claimDevices } from "@/lib/devices";
import { moveStock, postLedger } from "@/lib/services";
import { UsedPurchase } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ reason: z.string().trim().min(3, "Write why it is cancelled").max(200) });

/** Cancels a used-phone purchase entered by mistake (the phone must still be in stock). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  const { reason } = Body.parse(await req.json());
  const doc = await UsedPurchase.findOne({ _id: id, tenant: tid }).lean();
  assertBranchAccess(ctx, doc?.branch, "Purchase");
  if (!doc) throw new ApiError(404, "Not found.");
  if (doc.status === "cancelled") throw new ApiError(400, "Already cancelled.");
  await claimDevices({ tid, ids: [doc.device!], productId: doc.product, branch: doc.branch, to: "removed", event: { action: "Used purchase cancelled", refNo: doc.buyNo, note: reason }, userName: user.name });
  const claimed = await UsedPurchase.updateOne({ _id: doc._id, tenant: tid, status: "completed" }, { $set: { status: "cancelled", cancelledAt: new Date(), cancelledByName: user.name, cancelReason: reason } });
  if (!claimed.modifiedCount) throw new ApiError(409, "Changed by someone else just now. Please refresh.");
  await moveStock({ tid, branch: doc.branch, productId: doc.product, qty: -1, type: "void", refNo: doc.buyNo, note: `Used purchase cancelled: ${reason}`, userId: user.id, serialOk: true });
  if (doc.method === "khata" && doc.seller.party) {
    // Undoes the khata credit of the buy (an adjustment, like the buy itself) — no money moved, so it
    // must not count as a cancelled payment in the drawer or the reports.
    await postLedger({ tid, partyId: doc.seller.party, kind: "adjustment", amount: doc.price, refType: "used_buy", refId: doc._id, refNo: doc.buyNo, note: `Used phone purchase ${doc.buyNo} cancelled`, userId: user.id, branch: doc.branch });
  }
  await logActivity({ tid, user, branchId }, { action: "used.cancel", summary: `${doc.buyNo} cancelled (${doc.productName}, IMEI ${doc.imei}, Rs ${doc.price}) — ${reason}`, refType: "used_buy", refId: doc._id, refNo: doc.buyNo, amount: doc.price });
  return UsedPurchase.findOne({ _id: doc._id, tenant: tid }).select("-photos").lean();
});
