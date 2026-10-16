import { handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { openShift, shiftSummary } from "@/lib/shifts";

/** The open drawer of the current branch (null if none), with a live summary for owner/manager. */
export const GET = handle(async () => {
  const { user, tid, branch } = await requireBranch();
  const shift = await openShift(tid, branch._id);
  if (!shift) return { shift: null, branch: { _id: branch._id, name: branch.name } };
  const summary = user.role === "cashier" ? null : await shiftSummary(tid, shift, new Date());
  return { shift, summary, branch: { _id: branch._id, name: branch.name } };
});
