import { z } from "zod";
import { ApiError, dateRange, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { nextNumber, Shift } from "@/models";

/** Past and current drawer sessions. Cashiers see their own branch. */
export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 29);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  const list = await Shift.find({ tenant: ctx.tid, openedAt: { $gte: from, $lte: to }, ...(branch ? { branch } : {}) })
    .sort({ openedAt: -1 })
    .limit(400)
    .select("-summary")
    .lean();
  // A cashier sees whether the count matched only after the day is closed.
  return list.map((s) => (ctx.user.role === "cashier" && s.status === "open" ? { ...s, expectedCash: undefined } : s));
});

const Body = z.object({
  openingCash: z.coerce.number().min(0, "Opening cash cannot be negative").max(100_000_000),
  note: z.string().trim().max(200).optional(),
});

/** Opens the cash drawer for the current branch with the counted float. */
export const POST = handle(async (req) => {
  const { user, tid, branch } = await requireBranch();
  const body = Body.parse(await req.json());
  if (await Shift.exists({ tenant: tid, branch: branch._id, status: "open" })) {
    throw new ApiError(409, `The cash drawer of ${branch.name} is already open. Close it first.`);
  }
  // The float the last close left in the drawer: the opening count should match it.
  const last = await Shift.findOne({ tenant: tid, branch: branch._id, status: "closed" }).sort({ closedAt: -1 }).select("shiftNo floatLeft").lean();
  const openingCash = round2(body.openingCash);
  const expectedOpening = last?.floatLeft ?? undefined;
  const openingDifference = expectedOpening !== undefined && Math.abs(openingCash - expectedOpening) >= 0.5 ? round2(openingCash - expectedOpening) : undefined;
  const shiftNo = await nextNumber(tid, "shift", "SFT");
  try {
    const shift = await Shift.create({
      tenant: tid,
      shiftNo,
      branch: branch._id,
      branchName: branch.name,
      openingCash,
      openNote: body.note,
      ...(openingDifference !== undefined ? { expectedOpening, openingDifference } : {}),
      openedBy: user.id,
      openedByName: user.name,
    });
    const mismatch =
      openingDifference !== undefined
        ? ` — ${last!.shiftNo} left Rs ${expectedOpening} in the drawer, so Rs ${Math.abs(openingDifference)} ${openingDifference < 0 ? "is MISSING" : "is extra"}`
        : "";
    await logActivity({ tid, user, branchId: branch._id }, { action: "drawer.open", summary: `Opened cash drawer ${shiftNo} with Rs ${openingCash}${mismatch}`, refType: "shift", refId: shift._id, refNo: shiftNo, amount: openingCash });
    return shift.toObject();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, `The cash drawer of ${branch.name} is already open.`);
    throw err;
  }
});
