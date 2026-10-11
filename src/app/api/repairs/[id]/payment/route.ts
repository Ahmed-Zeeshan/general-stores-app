import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { assertOpen, loadRepair, paymentNo, repairTotals, saveRepair } from "@/lib/repairs";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  kind: z.enum(["payment", "refund"]).default("payment"),
  amount: z.coerce.number().positive("Enter the amount"),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
  ref: z.string().trim().max(40).optional(),
});

/** Money received for the job (more advance) or given back. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const r = await loadRepair(tid, id);
  assertOpen(r);
  const t = repairTotals(r);
  const amount = round2(body.amount);
  if (body.kind === "refund") {
    if (user.role === "cashier") throw new ApiError(403, "Only the owner or manager can give money back.");
    if (amount > t.paid + 0.004) throw new ApiError(400, `Only Rs ${t.paid} has been paid on this job.`);
  }
  const receiptNo = paymentNo(r);
  const saved = await saveRepair(
    tid,
    r,
    { $push: { payments: { kind: body.kind, amount: body.kind === "refund" ? -amount : amount, method: body.method, ref: body.ref, at: new Date(), userName: user.name, receiptNo } } },
    { note: `${body.kind === "refund" ? "Given back" : "Received"} Rs ${amount} (${body.method})`, userName: user.name },
  );
  if (body.kind === "refund") await logActivity({ tid, user, branchId }, { action: "repair.refund", summary: `${r.jobNo}: Rs ${amount} given back (${body.method})`, refType: "repair", refId: r._id, refNo: r.jobNo, amount });
  return { ...saved, ...repairTotals(saved), receiptNo };
});
