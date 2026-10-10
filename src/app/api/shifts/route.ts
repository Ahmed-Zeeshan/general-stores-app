import { z } from "zod";
import { ApiError, dateRange, handle } from "@/lib/api";
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
  const shiftNo = await nextNumber(tid, "shift", "SFT");
  try {
    const shift = await Shift.create({
      tenant: tid,
      shiftNo,
      branch: branch._id,
      branchName: branch.name,
      openingCash: round2(body.openingCash),
      openNote: body.note,
      openedBy: user.id,
      openedByName: user.name,
    });
    return shift.toObject();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, `The cash drawer of ${branch.name} is already open.`);
    throw err;
  }
});
