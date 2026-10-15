import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assertBranchAccess, requireBranch } from "@/lib/branches";
import { postWalletTxn } from "@/lib/wallets";
import { WalletTxn } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ reason: z.string().trim().min(3, "Write why it is cancelled").max(200) });

/** Cancels a wrong entry: its balance and cash effects are undone by a "cancelled entry" record. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { user, tid, branchId } = ctx;
  const { id } = await params;
  const { reason } = Body.parse(await req.json());
  const t = await WalletTxn.findOne({ _id: id, tenant: tid }).lean();
  assertBranchAccess(ctx, t?.branch, "Entry");
  if (!t) throw new ApiError(404, "Entry not found.");
  if (t.type === "reversal") throw new ApiError(400, "A cancellation cannot be cancelled.");
  const claimed = await WalletTxn.updateOne({ _id: t._id, tenant: tid, reversed: false }, { $set: { reversed: true, reverseReason: reason } });
  if (!claimed.modifiedCount) throw new ApiError(400, "This entry was already cancelled.");
  let rev;
  try {
    rev = await postWalletTxn({
      tid,
      walletId: t.wallet,
      type: "reversal",
      amount: t.amount,
      fee: -(t.fee ?? 0),
      commission: -(t.commission ?? 0),
      walletEffect: -t.walletEffect,
      cashEffect: -t.cashEffect,
      method: t.method,
      data: { reverses: t._id, reverseReason: reason, customerNumber: t.customerNumber, packageName: t.packageName, note: `Cancels ${t.txnNo}` },
      user,
    });
  } catch (err) {
    await WalletTxn.updateOne({ _id: t._id, tenant: tid }, { $set: { reversed: false }, $unset: { reverseReason: 1 } });
    throw err;
  }
  await logActivity({ tid, user, branchId }, { action: "wallet.reverse", summary: `${t.txnNo} (${t.type}, Rs ${t.amount}) cancelled — ${reason}`, refType: "wallet", refId: t.wallet, refNo: rev.txnNo, amount: t.amount });
  return rev.toObject();
});
