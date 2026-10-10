import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { shiftSummary } from "@/lib/shifts";
import { Shift } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** Counted cash. If denominations are given, the counted cash is their total. */
  countedCash: z.coerce.number().min(0).max(100_000_000).optional(),
  denominations: z
    .array(z.object({ value: z.coerce.number().min(0), count: z.coerce.number().min(0).max(1_000_000) }))
    .max(20)
    .optional(),
  note: z.string().trim().max(300).optional(),
});

/** Day close: saves the counted cash, the expected cash and the Z report. Cannot be changed afterwards. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const shift = await Shift.findOne({ _id: id, tenant: tid, branch: branchId }).lean();
  if (!shift) throw new ApiError(404, "Shift not found at your branch.");
  if (shift.status !== "open") throw new ApiError(400, "This day is already closed.");

  // value 0 = loose coins entered as an amount
  const denominations = body.denominations?.filter((d) => d.count > 0);
  const fromNotes = denominations?.length ? round2(denominations.reduce((a, d) => a + (d.value === 0 ? d.count : d.value * d.count), 0)) : undefined;
  const countedCash = fromNotes ?? (body.countedCash !== undefined ? round2(body.countedCash) : undefined);
  if (countedCash === undefined) throw new ApiError(400, "Count the cash in the drawer and enter the amount.");

  const closedAt = new Date();
  const summary = await shiftSummary(tid, shift, closedAt);
  const closed = await Shift.findOneAndUpdate(
    { _id: shift._id, tenant: tid, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt,
        closedBy: user.id,
        closedByName: user.name,
        countedCash,
        denominations,
        expectedCash: summary.expectedCash,
        difference: round2(countedCash - summary.expectedCash),
        closeNote: body.note,
        summary,
      },
    },
    { new: true },
  ).lean();
  if (!closed) throw new ApiError(400, "This day is already closed.");
  return closed;
});
