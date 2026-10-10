import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireBranch } from "@/lib/branches";
import { postLedger } from "@/lib/services";
import { nextNumber, Party } from "@/models";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** payment = money received from customer / paid to supplier. charge = add to what is owed. */
  type: z.enum(["payment", "charge"]),
  amount: z.coerce.number().positive("Amount must be more than zero").max(100_000_000, "Amount is too large"),
  method: z.enum(["cash", "card", "jazzcash", "easypaisa", "bank"]).default("cash"),
  note: z.string().trim().max(200).optional(),
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const party = await Party.findOne({ _id: id, tenant: tid }).lean();
  if (!party) throw new ApiError(404, "Not found.");
  if (party.type === "supplier" && user.role === "cashier") throw new ApiError(403, "Only owner or manager can pay suppliers.");
  if (body.type === "charge" && user.role === "cashier") throw new ApiError(403, "Only owner or manager can add manual udhaar.");

  if (body.type === "charge") {
    return postLedger({ tid, partyId: id, kind: "adjustment", amount: body.amount, note: body.note, userId: user.id, branch: branchId });
  }
  // Every payment gets its own receipt / voucher number.
  const refNo = party.type === "customer" ? await nextNumber(tid, "receipt", "RCP") : await nextNumber(tid, "payout", "PAY");
  return postLedger({
    tid,
    partyId: id,
    kind: "payment",
    amount: -body.amount,
    method: body.method,
    refType: "payment",
    refNo,
    note: body.note,
    userId: user.id,
    branch: branchId,
  });
});
