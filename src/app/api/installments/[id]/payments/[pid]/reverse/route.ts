import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { InstallmentPlan } from "@/models";
import { loadPlan, savePlan, withState } from "@/lib/installments";

type Ctx = { params: Promise<{ id: string; pid: string }> };
const Body = z.object({ reason: z.string().trim().min(3, "Write why").max(200) });

/** Cancels an installment payment entered by mistake (kept in the list, marked cancelled). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id, pid } = await params;
  const { reason } = Body.parse(await req.json());
  const p = await loadPlan(tid, id);
  if (p.status === "cancelled") throw new ApiError(400, "This plan is closed.");
  const pay = p.payments.find((x) => String((x as { _id?: unknown })._id) === pid);
  if (!pay || pay.kind !== "payment") throw new ApiError(404, "Payment not found.");
  if (pay.reversed) throw new ApiError(400, "This payment was already cancelled.");
  const claimed = await InstallmentPlan.updateOne({ _id: p._id, tenant: tid, seq: p.seq ?? 0, "payments._id": (pay as { _id: unknown })._id }, { $set: { "payments.$.reversed": true } });
  if (!claimed.modifiedCount) throw new ApiError(409, "Someone else changed this plan just now. Please refresh.");
  const fresh = await loadPlan(tid, id);
  const saved = await savePlan(tid, fresh, { $push: { payments: { kind: "reversal", amount: -pay.amount, method: pay.method, note: reason, reverses: pay.receiptNo, at: new Date(), userName: user.name } } });
  await logActivity({ tid, user, branchId }, { action: "installment.reverse", summary: `${p.planNo}: payment ${pay.receiptNo} of Rs ${pay.amount} cancelled — ${reason}`, refType: "installment", refId: p._id, refNo: pay.receiptNo, amount: pay.amount });
  return withState(saved);
});
