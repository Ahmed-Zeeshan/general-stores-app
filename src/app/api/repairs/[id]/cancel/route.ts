import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { assertOpen, loadRepair, paymentNo, repairTotals, saveRepair } from "@/lib/repairs";
import { moveStock } from "@/lib/services";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  reason: z.string().trim().min(3, "Write why (e.g. customer did not want the repair)").max(200),
  /** Kept as a checking charge (the rest of the advance is given back). */
  charge: z.coerce.number().min(0).default(0),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
});

/** Phone returned without repair: parts back to stock, advance back except any checking charge. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const r = await loadRepair(tid, id);
  assertOpen(r);
  const t = repairTotals(r);
  const charge = round2(body.charge);
  const refund = round2(t.paid - charge);
  if (refund < -0.004) throw new ApiError(400, `Only Rs ${t.paid} was paid. Take the checking charge as a payment first, or lower it.`);
  const now = new Date();
  const saved = await saveRepair(
    tid,
    r,
    {
      $set: { status: "cancelled", cancelledAt: now, cancelReason: body.reason, parts: [], labour: charge, discount: 0, deliveredAt: now, deliveredByName: user.name },
      ...(refund > 0.004 ? { $push: { payments: { kind: "refund", amount: -refund, method: body.method, at: now, userName: user.name, receiptNo: paymentNo(r) } } } : {}),
    },
    { status: "cancelled", note: `${body.reason}${charge ? ` · checking charge Rs ${charge}` : ""}${refund > 0.004 ? ` · Rs ${refund} given back` : ""}`, userName: user.name },
  );
  for (const p of r.parts) {
    await moveStock({ tid, branch: r.branch, productId: p.product, qty: p.qty, type: "repair", refNo: r.jobNo, note: `Repair ${r.jobNo} cancelled`, userId: user.id });
  }
  await logActivity({ tid, user, branchId }, { action: "repair.cancel", summary: `${r.jobNo} returned without repair — ${body.reason}${refund > 0.004 ? `; Rs ${refund} given back` : ""}`, refType: "repair", refId: r._id, refNo: r.jobNo, amount: refund > 0 ? refund : undefined });
  return { ...saved, ...repairTotals(saved) };
});
