import { z } from "zod";
import { ApiError, dateRange, escapeRegex, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { postWalletTxn, txnEffects } from "@/lib/wallets";
import { MobilePackage, Wallet, WalletTxn } from "@/models";

/** Entries of this branch (?from&to, ?wallet, ?type, ?q number / txn no / ref) with day totals. */
export const GET = handle(async (req) => {
  const { tid, branchId } = await requireBranch();
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 0);
  const query: Record<string, unknown> = { tenant: tid, branch: branchId, createdAt: { $gte: from, $lte: to } };
  const wallet = url.searchParams.get("wallet");
  if (wallet) query.wallet = wallet;
  const type = url.searchParams.get("type");
  if (type) query.type = type;
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ txnNo: rx }, { customerNumber: rx }, { customerName: rx }, { ref: rx }, { packageName: rx }];
  }
  const rows = await WalletTxn.find(query).sort({ createdAt: -1 }).limit(2000).lean();
  // Totals leave out cancelled entries and their cancellations.
  const live = rows.filter((r) => !r.reversed && r.type !== "reversal");
  const byType: Record<string, { count: number; amount: number; profit: number }> = {};
  for (const r of live) {
    const b = (byType[r.type] ??= { count: 0, amount: 0, profit: 0 });
    b.count++;
    b.amount = round2(b.amount + r.amount);
    b.profit = round2(b.profit + (r.fee ?? 0) + (r.commission ?? 0));
  }
  return {
    rows,
    summary: {
      count: live.length,
      profit: round2(live.reduce((a, r) => a + (r.fee ?? 0) + (r.commission ?? 0), 0)),
      cashNet: round2(rows.reduce((a, r) => a + r.cashEffect, 0)),
      byType,
    },
  };
});

const Body = z.object({
  walletId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose the account"),
  type: z.enum(["load", "package", "cash_in", "cash_out", "bill", "float_in", "float_out", "commission"]),
  amount: z.coerce.number().positive("Enter the amount").max(10_000_000).optional(),
  fee: z.coerce.number().min(0).max(1_000_000).default(0),
  /** Override the commission worked out from the account / package. */
  commission: z.coerce.number().min(0).max(1_000_000).optional(),
  /** Top-up: what the shop paid for the balance (default = amount). */
  paid: z.coerce.number().min(0).max(10_000_000).optional(),
  method: z.enum(["cash", "bank", "other"]).default("cash"),
  packageId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  customerNumber: z.string().trim().max(30).optional(),
  customerName: z.string().trim().max(60).optional(),
  ref: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

const MOBILE = /^(\+?92|0)?3\d{2}[\s-]?\d{7}$/;

/** Records an Easyload, package, cash in / out, bill payment, top-up, withdrawal or commission. */
export const POST = handle(async (req) => {
  const { user, tid, branchId } = await requireBranch();
  const body = Body.parse(await req.json());
  if (["float_in", "float_out", "commission"].includes(body.type) && user.role === "cashier") throw new ApiError(403, "Only the owner or manager can top up, withdraw or record commission.");
  const w = await Wallet.findOne({ _id: body.walletId, tenant: tid, branch: branchId, active: true }).lean();
  if (!w) throw new ApiError(404, "Account not found at this branch.");
  if ((body.type === "load" || body.type === "package") && !MOBILE.test(body.customerNumber ?? "")) throw new ApiError(400, "Enter the customer's mobile number (03xx xxxxxxx).");

  let amount = body.amount ?? 0;
  let commission = 0;
  const data: Record<string, unknown> = { customerNumber: body.customerNumber, customerName: body.customerName, ref: body.ref, note: body.note };
  if (body.type === "package") {
    if (!body.packageId) throw new ApiError(400, "Choose the package.");
    const pkg = await MobilePackage.findOne({ _id: body.packageId, tenant: tid, active: true }).lean();
    if (!pkg) throw new ApiError(404, "Package not found.");
    amount = pkg.price;
    commission = pkg.commission ?? round2((pkg.price * (w.commissionPct ?? 0)) / 100);
    Object.assign(data, { package: pkg._id, packageName: pkg.name, operator: pkg.operator });
  } else {
    if (!(amount > 0)) throw new ApiError(400, "Enter the amount.");
    if (body.type === "load") commission = round2((amount * (w.commissionPct ?? 0)) / 100);
    if (body.type === "commission") commission = amount;
    if (body.type === "float_in") commission = round2(Math.max(0, amount - (body.paid ?? amount)));
  }
  if (body.commission !== undefined && body.type !== "commission") {
    if (user.role === "cashier") throw new ApiError(403, "Only the owner or manager can change the commission.");
    commission = body.commission;
  }
  if (body.type === "float_in" && (body.paid ?? amount) > amount) throw new ApiError(400, "Paid cannot be more than the balance received.");
  const fx = txnEffects(body.type, { amount, fee: body.fee, paid: body.paid, method: body.method });
  const txn = await postWalletTxn({ tid, walletId: w._id, branch: branchId, type: body.type, amount, fee: body.fee, commission, ...fx, method: body.method, data, user });
  if (["float_in", "float_out", "commission"].includes(body.type)) {
    await logActivity({ tid, user, branchId }, { action: `wallet.${body.type}`, summary: `${txn.txnNo} ${w.name}: ${body.type === "float_in" ? `topped up Rs ${amount}${body.paid !== undefined ? ` (paid Rs ${body.paid})` : ""}` : body.type === "float_out" ? `withdrew Rs ${amount}` : `commission Rs ${amount}`}`, refType: "wallet", refId: w._id, refNo: txn.txnNo, amount });
  }
  return txn.toObject();
});
