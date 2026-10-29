import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { shiftSummary } from "@/lib/shifts";
import { Shift } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  counted: z.coerce.number().min(0).max(100_000_000),
  toName: z.string().trim().max(60).optional(),
  note: z.string().trim().max(200).optional(),
});

/**
 * A mid-day handover between cashiers: the person leaving counts the drawer and it is logged against
 * what should be there so far. The day's variance still settles at the close (option a) — this is for
 * accountability, so the owner can see at which handover a count started to drift.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const shift = await Shift.findOne({ _id: id, tenant: tid, branch: branchId, status: "open" }).lean();
  if (!shift) throw new ApiError(400, "This cash drawer is not open at your branch.");
  const at = new Date();
  const expected = round2((await shiftSummary(tid, shift, at)).expectedCash);
  const counted = round2(body.counted);
  const difference = round2(counted - expected);
  const updated = await Shift.findOneAndUpdate(
    { _id: id, tenant: tid, status: "open" },
    { $push: { handovers: { at, byName: user.name, toName: body.toName, counted, expected, difference, note: body.note } } },
    { new: true },
  ).lean();
  if (!updated) throw new ApiError(400, "This cash drawer is not open.");
  await logActivity(
    { tid, user, branchId },
    {
      action: "drawer.handover",
      summary: `Handover by ${user.name}${body.toName ? ` to ${body.toName}` : ""}: counted Rs ${counted}, should be Rs ${expected}${Math.abs(difference) < 0.5 ? " — exact" : difference < 0 ? ` — SHORT Rs ${-difference}` : ` — over Rs ${difference}`}`,
      refType: "shift",
      refId: updated._id,
      refNo: updated.shiftNo,
      amount: Math.abs(difference),
    },
  );
  return updated;
});
