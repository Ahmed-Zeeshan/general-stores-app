import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { addDays, ApiError, handle } from "@/lib/api";
import { round2 } from "@/lib/money";
import { assertOpen, loadRepair, paymentNo, repairTotals, saveRepair } from "@/lib/repairs";
import { postLedger } from "@/lib/services";
import { Party } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  /** Collected now (default: the whole balance). */
  amount: z.coerce.number().min(0).optional(),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
  ref: z.string().trim().max(40).optional(),
  /** Put what is still unpaid on the customer's khata (udhaar). */
  toKhata: z.boolean().default(false),
});

/** Hands the phone back: collects the balance (or puts it on khata), starts the repair warranty. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const r = await loadRepair(tid, id);
  assertOpen(r);
  const t = repairTotals(r);
  const now = new Date();
  const payments: Record<string, unknown>[] = [];
  let left = t.balance;
  if (left < -0.004) {
    // More advance than the bill: give the extra back.
    payments.push({ kind: "refund", amount: left, method: body.method, at: now, userName: user.name, receiptNo: paymentNo(r) });
    left = 0;
  } else {
    const collect = round2(Math.min(body.amount ?? left, left));
    if (collect > 0) payments.push({ kind: "payment", amount: collect, method: body.method, ref: body.ref, at: now, userName: user.name, receiptNo: paymentNo(r) });
    left = round2(left - collect);
  }
  let creditAmount = 0;
  if (left > 0.004) {
    if (!body.toKhata) throw new ApiError(400, `Rs ${left} is still to collect. Collect it, or put it on the customer's khata.`);
    if (!r.customer) throw new ApiError(400, "This job has no customer khata. Collect the full amount.");
    const party = await Party.findOne({ _id: r.customer, tenant: tid }).lean();
    if (party && party.creditLimit > 0 && party.balance + left > party.creditLimit && user.role !== "owner") throw new ApiError(400, `Credit limit crossed for ${party.name}. Ask the owner.`);
    creditAmount = left;
  }
  const saved = await saveRepair(
    tid,
    r,
    {
      $set: { status: "delivered", deliveredAt: now, deliveredByName: user.name, creditAmount, ...(r.warrantyDays ? { warrantyUntil: addDays(now, r.warrantyDays) } : {}) },
      ...(payments.length ? { $push: { payments: { $each: payments } } } : {}),
    },
    { status: "delivered", note: creditAmount ? `Rs ${creditAmount} put on khata` : undefined, userName: user.name },
  );
  if (creditAmount > 0) {
    await postLedger({ tid, partyId: r.customer!, kind: "sale", amount: creditAmount, refType: "repair", refId: r._id, refNo: r.jobNo, note: `Repair ${r.jobNo} (${r.deviceName})`, userId: user.id, branch: r.branch });
  }
  await logActivity({ tid, user, branchId }, { action: "repair.deliver", summary: `${r.jobNo} delivered to ${r.customerName}: bill Rs ${t.total}${creditAmount ? `, Rs ${creditAmount} on khata` : ""}`, refType: "repair", refId: r._id, refNo: r.jobNo, amount: t.total });
  return { ...saved, ...repairTotals(saved) };
});
