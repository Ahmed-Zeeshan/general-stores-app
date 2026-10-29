import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { Shift, User } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  kind: z.enum(["in", "out"]),
  amount: z.coerce.number().positive("Amount must be more than zero").max(100_000_000),
  reason: z.string().trim().min(2, "Write a reason, e.g. 'Bank deposit' or 'Change from bank'").max(120),
});

/** Cash put into or taken out of the drawer that is not a sale (change float, bank deposit, owner took cash). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  // Staff may be blocked from taking cash OUT of the drawer (owner setting per staff member).
  if (body.kind === "out" && user.role !== "owner") {
    const me = await User.findOne({ _id: user.id, tenant: tid }).select("allowCashOut").lean();
    if (me && me.allowCashOut === false) throw new ApiError(403, "You are not allowed to take cash out of the drawer. Ask the owner.");
  }
  const updated = await Shift.findOneAndUpdate(
    { _id: id, tenant: tid, branch: branchId, status: "open" },
    { $push: { movements: { kind: body.kind, amount: round2(body.amount), reason: body.reason, at: new Date(), user: user.id, userName: user.name } } },
    { new: true },
  ).lean();
  if (!updated) throw new ApiError(400, "This cash drawer is not open at your branch.");
  await logActivity(
    { tid, user, branchId },
    { action: body.kind === "in" ? "drawer.in" : "drawer.out", summary: `Cash ${body.kind === "in" ? "put in" : "taken out"}: Rs ${round2(body.amount)} — ${body.reason}`, refType: "shift", refId: updated._id, refNo: updated.shiftNo, amount: round2(body.amount) },
  );
  return updated;
});
