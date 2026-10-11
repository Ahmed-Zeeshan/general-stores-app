import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { loadPlan, savePlan, withState } from "@/lib/installments";
import { round2 } from "@/lib/money";
import { createReturn } from "@/lib/returns";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  reason: z.string().trim().min(3, "Write why the plan is closed").max(200),
  /** Put the goods back in stock (customer stopped paying and returned them). */
  takeBack: z.boolean().default(true),
  /** Money given back to the customer when closing (optional). */
  refund: z.coerce.number().min(0).default(0),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
});

/** Closes a plan early: goods back to stock (optional), the unpaid balance written off. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const p = await loadPlan(tid, id);
  if (p.status === "cancelled") throw new ApiError(400, "This plan is already closed.");
  const totalIn = round2(p.paid + p.advance);
  if (body.refund > totalIn + 0.004) throw new ApiError(400, `The customer paid Rs ${totalIn} in all; the refund cannot be more.`);
  let returnNo: string | undefined;
  if (body.takeBack) {
    const ret = await createReturn({ tid, saleId: String(p.sale), user: { id: user.id, name: user.name }, fallbackBranch: branchId, reason: body.reason, installmentPlan: p.planNo });
    returnNo = ret.returnNo;
  }
  const balance = round2(Math.max(0, p.financed - p.paid));
  const saved = await savePlan(tid, p, {
    $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: `${body.reason}${returnNo ? ` (goods back: ${returnNo})` : ""}`, writtenOff: balance },
    ...(body.refund > 0 ? { $push: { payments: { kind: "refund", amount: -round2(body.refund), method: body.method, note: "Given back on closing", at: new Date(), userName: user.name } } } : {}),
  });
  await logActivity(
    { tid, user, branchId },
    { action: "installment.cancel", summary: `${p.planNo} closed — ${body.reason}${returnNo ? `; goods back in stock (${returnNo})` : ""}; Rs ${balance} written off${body.refund ? `; Rs ${body.refund} given back` : ""}`, refType: "installment", refId: p._id, refNo: p.planNo, amount: balance },
  );
  return withState(saved);
});
