import { handle, startOfDay } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { openShift, shiftSummary } from "@/lib/shifts";
import { Sale, Shift } from "@/models";
import type { Types } from "mongoose";

/**
 * Bills made today at this branch while no drawer was open: their cash is in no drawer report.
 * (Bills saved before drawer links existed have no link either, so they are checked against the
 * drawer sessions' times.)
 */
async function unlinkedToday(tid: Types.ObjectId, branch: Types.ObjectId) {
  const from = startOfDay(new Date());
  const bills = await Sale.find({ tenant: tid, branch, shift: { $exists: false }, createdAt: { $gte: from } }).select("createdAt payments paymentMethod amountPaid").lean();
  if (!bills.length) return { bills: 0, cash: 0 };
  const sessions = await Shift.find({ tenant: tid, branch, $or: [{ status: "open" }, { closedAt: { $gte: from } }] }).select("openedAt closedAt status").lean();
  const outside = bills.filter((b) => !sessions.some((s) => b.createdAt >= s.openedAt && (s.status === "open" || (s.closedAt && b.createdAt <= s.closedAt))));
  const cashOf = (b: (typeof bills)[number]) =>
    b.payments?.length ? b.payments.filter((p) => p.method === "cash").reduce((x, p) => x + p.amount, 0) : b.paymentMethod === "cash" ? (b.amountPaid ?? 0) : 0;
  const cash = outside.reduce((a, b) => a + cashOf(b), 0);
  return { bills: outside.length, cash: round2(cash) };
}

/** The open drawer of the current branch (null if none), with a live summary for owner/manager. */
export const GET = handle(async () => {
  const { user, tid, branch } = await requireBranch();
  const shift = await openShift(tid, branch._id);
  const unlinked = await unlinkedToday(tid, branch._id);
  if (!shift) {
    // For the opening count: what the last close left in the drawer.
    const last = await Shift.findOne({ tenant: tid, branch: branch._id, status: "closed" }).sort({ closedAt: -1 }).select("shiftNo closedAt floatLeft countedCash").lean();
    return { shift: null, lastClose: last ?? null, unlinked, branch: { _id: branch._id, name: branch.name } };
  }
  const summary = user.role === "cashier" ? null : await shiftSummary(tid, shift, new Date());
  return { shift, summary, unlinked, branch: { _id: branch._id, name: branch.name } };
});
