import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { loadPlan, receiptNo, savePlan, withState } from "@/lib/installments";
import { round2 } from "@/lib/money";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  amount: z.coerce.number().positive("Enter the amount"),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
  ref: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

/** Receives an installment (any amount up to the balance; matched to the oldest months first). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch();
  const { user, tid } = ctx;
  const { id } = await params;
  const body = Body.parse(await req.json());
  const p = await loadPlan(tid, id);
  assertBranchAccess(ctx, p.branch, "Installment plan");
  if (p.status !== "active") throw new ApiError(400, p.status === "completed" ? "This plan is fully paid." : "This plan is closed.");
  const s = withState(p);
  const amount = round2(body.amount);
  if (amount > s.balance + 0.004) throw new ApiError(400, `Only Rs ${s.balance} is left on this plan.`);
  const no = receiptNo(p);
  const saved = await savePlan(tid, p, { $push: { payments: { kind: "payment", amount, method: body.method, ref: body.ref, note: body.note, receiptNo: no, at: new Date(), userName: user.name } } });
  return { ...withState(saved), receiptNo: no };
});
