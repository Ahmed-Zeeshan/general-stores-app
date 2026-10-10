import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { shiftSummary } from "@/lib/shifts";
import { Shift } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

/** One shift with its Z report (saved at close; live while open, owner/manager only). */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const ctx = await requireBranch();
  const { id } = await params;
  const shift = await Shift.findOne({ tenant: ctx.tid, _id: id }).lean();
  if (!shift) throw new ApiError(404, "Shift not found.");
  if ((ctx.locked || ctx.user.role === "cashier") && String(shift.branch) !== String(ctx.branchId)) throw new ApiError(404, "Shift not found.");
  if (shift.status === "open") {
    if (ctx.user.role === "cashier") return { ...shift, summary: null };
    return { ...shift, summary: await shiftSummary(ctx.tid, shift, new Date()) };
  }
  return shift;
});
