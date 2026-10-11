import { z } from "zod";
import { handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { WALLET_KINDS, WALLET_PROVIDERS } from "@/lib/constants";
import { postWalletTxn } from "@/lib/wallets";
import { Wallet } from "@/models";

/** Easyload SIMs, wallet and bank accounts of this branch (?all=1 includes switched-off ones). */
export const GET = handle(async (req) => {
  const { tid, branchId } = await requireBranch();
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Wallet.find({ tenant: tid, branch: branchId, ...(all ? {} : { active: true }) }).sort({ kind: 1, name: 1 }).lean();
});

const WalletInput = z.object({
  name: z.string().trim().min(2, "Give the account a name, e.g. Jazz Easyload SIM").max(60),
  kind: z.enum(WALLET_KINDS),
  provider: z.enum(WALLET_PROVIDERS),
  number: z.string().trim().max(30).optional(),
  lowAlert: z.coerce.number().min(0).default(0),
  commissionPct: z.coerce.number().min(0).max(50).default(0),
  feePct: z.coerce.number().min(0).max(50).default(0),
});

/** Adds an account; its current balance is recorded as an opening entry. */
export const POST = handle(async (req) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const raw = await req.json();
  const body = WalletInput.parse(raw);
  const opening = z.coerce.number().min(0).default(0).parse(raw.openingBalance);
  const w = await Wallet.create({ ...body, tenant: tid, branch: branchId, balance: 0 });
  if (opening > 0) {
    await postWalletTxn({ tid, walletId: w._id, type: "adjust", amount: opening, walletEffect: opening, cashEffect: 0, method: "other", data: { note: "Opening balance" }, user });
  }
  await logActivity({ tid, user, branchId }, { action: "wallet.create", summary: `Added ${body.name} (${body.provider}) with balance Rs ${opening}`, refType: "wallet", refId: w._id });
  return Wallet.findOne({ _id: w._id, tenant: tid }).lean();
});
