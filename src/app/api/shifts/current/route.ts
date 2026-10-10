import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { shiftSummary } from "@/lib/shifts";
import { Shift } from "@/models";

/** The open drawer of the current branch (null if none), with a live summary for owner/manager. */
export const GET = handle(async () => {
  const { user, tid, branch } = await requireBranch();
  const shift = await Shift.findOne({ tenant: tid, branch: branch._id, status: "open" }).lean();
  if (!shift) return { shift: null, branch: { _id: branch._id, name: branch.name } };
  const summary = user.role === "cashier" ? null : await shiftSummary(tid, shift, new Date());
  return { shift, summary, branch: { _id: branch._id, name: branch.name } };
});
