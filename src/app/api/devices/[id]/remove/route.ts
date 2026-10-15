import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { claimDevices } from "@/lib/devices";
import { moveStock } from "@/lib/services";
import { Device } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ reason: z.string().trim().min(3, "Write why the phone is removed (e.g. damaged, lost, wrong entry)").max(200) });

/** Takes an in-stock phone out of stock (damaged, lost, entered by mistake). Kept in the history. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  const { reason } = Body.parse(await req.json());
  const d = await Device.findOne({ _id: id, tenant: tid }).lean();
  assertBranchAccess(ctx, d?.branch, "Phone");
  if (!d) throw new ApiError(404, "Phone not found.");
  await claimDevices({ tid, ids: [d._id], productId: d.product, branch: d.branch, to: "removed", event: { action: "Removed from stock", note: reason }, userName: user.name });
  await moveStock({ tid, branch: d.branch, productId: d.product, qty: -1, type: "adjustment", note: `IMEI ${d.imei} removed: ${reason}`, userId: user.id, serialOk: true });
  await logActivity({ tid, user, branchId }, { action: "device.remove", summary: `${d.productName} IMEI ${d.imei} removed from stock — ${reason}`, refType: "device", refId: d._id, amount: d.cost });
  return Device.findOne({ _id: d._id, tenant: tid }).lean();
});
