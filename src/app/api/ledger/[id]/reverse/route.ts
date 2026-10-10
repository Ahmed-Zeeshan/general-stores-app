import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { postLedger } from "@/lib/services";
import { LedgerEntry } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ reason: z.string().trim().max(200).optional() });

/**
 * Cancels a payment entered by mistake. The original stays in the khata (marked cancelled) and a
 * matching "reversal" entry puts the amount back, so the history is never rewritten.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const { reason } = Body.parse(await req.json().catch(() => ({})));
  const entry = await LedgerEntry.findOne({ _id: id, tenant: tid }).lean();
  if (!entry) throw new ApiError(404, "Entry not found.");
  if (entry.kind !== "payment" || entry.refType !== "payment") throw new ApiError(400, "Only payments received or made from the khata can be cancelled here.");
  // Claim it first so two clicks cannot cancel it twice.
  const claimed = await LedgerEntry.updateOne(
    { _id: entry._id, tenant: tid, reversed: { $ne: true } },
    { $set: { reversed: true, reversedAt: new Date(), reversedBy: user.id, reverseReason: reason } },
  );
  if (!claimed.modifiedCount) throw new ApiError(400, "This payment is already cancelled.");
  return postLedger({
    tid,
    partyId: entry.party,
    kind: "reversal",
    amount: -entry.amount,
    method: entry.method ?? undefined,
    refType: "reversal",
    refId: entry._id,
    refNo: entry.refNo ?? undefined,
    note: `${entry.refNo ?? "Payment"} cancelled${reason ? ` — ${reason}` : ""}`,
    userId: user.id,
    branch: branchId,
  });
});
