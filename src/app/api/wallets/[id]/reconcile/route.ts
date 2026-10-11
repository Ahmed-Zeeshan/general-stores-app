import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { postWalletTxn } from "@/lib/wallets";
import { Wallet } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ actual: z.coerce.number().min(0), note: z.string().trim().max(200).optional() });

/** Balance check: the balance shown on the SIM / app; any difference is recorded as a correction. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const { id } = await params;
  const body = Body.parse(await req.json());
  const w = await Wallet.findOne({ _id: id, tenant: tid }).lean();
  if (!w) throw new ApiError(404, "Account not found.");
  const diff = round2(body.actual - w.balance);
  if (Math.abs(diff) < 0.005) return { wallet: w, difference: 0 };
  const txn = await postWalletTxn({
    tid,
    walletId: w._id,
    type: "adjust",
    amount: Math.abs(diff),
    walletEffect: diff,
    cashEffect: 0,
    method: "other",
    data: { note: `Balance check: app shows Rs ${body.actual}, records showed Rs ${round2(w.balance)}${body.note ? ` — ${body.note}` : ""}` },
    user,
  });
  await logActivity({ tid, user, branchId }, { action: "wallet.reconcile", summary: `${w.name}: balance corrected by Rs ${diff} (app shows Rs ${body.actual})`, refType: "wallet", refId: w._id, refNo: txn.txnNo, amount: Math.abs(diff) });
  return { wallet: await Wallet.findOne({ _id: w._id, tenant: tid }).lean(), difference: diff, txn };
});
