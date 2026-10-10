import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { moveStock } from "@/lib/services";
import { StockBatch } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** How much to write off; default = everything left in the batch. */
  qty: z.coerce.number().positive().optional(),
  reason: z.string().trim().max(120).optional(),
});

/** Throws away (writes off) an expired or damaged batch: stock out as wastage. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json().catch(() => ({})));
  const batch = await StockBatch.findOne({ _id: id, tenant: ctx.tid }).lean();
  if (!batch) throw new ApiError(404, "Batch not found.");
  if ((ctx.locked || ctx.user.role === "cashier") && String(batch.branch) !== String(ctx.branchId)) throw new ApiError(404, "Batch not found.");
  if (!ctx.branches.some((b) => String(b._id) === String(batch.branch))) throw new ApiError(404, "Batch not found.");
  const qty = Math.min(body.qty ?? batch.qty, batch.qty);
  if (!(qty > 0)) throw new ApiError(400, "This batch is already empty.");
  const expired = batch.expiryDate && batch.expiryDate.getTime() < Date.now();
  await moveStock({
    tid: ctx.tid,
    branch: batch.branch,
    productId: batch.product,
    qty: -qty,
    type: "wastage",
    refNo: batch.refNo ?? undefined,
    note: body.reason || (expired ? "Expired stock thrown away" : "Batch written off"),
    userId: ctx.user.id,
    batch: { batchId: batch._id },
  });
  return StockBatch.findOne({ _id: id, tenant: ctx.tid }).lean();
});
