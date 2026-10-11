import type { Types } from "mongoose";
import { ApiError } from "./api";
import { round2 } from "./money";
import { PROVIDER_LABELS, type WalletTxnType } from "./constants";
import { nextNumber, Wallet, WalletTxn } from "@/models";

/**
 * How an entry changes the wallet balance and the cash drawer.
 * - Easyload, package, cash in (send money), bill: the customer pays cash (+ fee); the wallet goes down.
 * - Cash out: the customer gets cash (less the fee); the wallet goes up.
 * - Top-up: the wallet goes up by `amount`; `paid` left the drawer (any extra is the operator's bonus = commission).
 * - Withdrawn: the wallet goes down, the cash comes into the drawer.
 * - Commission received: the wallet goes up; no cash.
 * `method` other than cash (paid by bank, from another account…) does not touch the drawer.
 */
export function txnEffects(type: WalletTxnType, v: { amount: number; fee?: number; paid?: number; method: "cash" | "bank" | "other"; up?: boolean }) {
  const a = round2(v.amount);
  const fee = round2(v.fee ?? 0);
  const cash = v.method === "cash";
  switch (type) {
    case "load":
    case "package":
    case "cash_in":
    case "bill":
      return { walletEffect: -a, cashEffect: cash ? round2(a + fee) : 0 };
    case "cash_out":
      if (fee > a) throw new ApiError(400, "The fee cannot be more than the amount.");
      return { walletEffect: a, cashEffect: cash ? -round2(a - fee) : 0 };
    case "float_in": {
      const paid = round2(v.paid ?? a);
      return { walletEffect: a, cashEffect: cash ? -paid : 0 };
    }
    case "float_out":
      return { walletEffect: -a, cashEffect: cash ? a : 0 };
    case "commission":
      return { walletEffect: a, cashEffect: 0 };
    case "adjust":
      return { walletEffect: v.up ? a : -a, cashEffect: 0 };
    default:
      throw new ApiError(400, "Unknown entry type.");
  }
}

/**
 * Changes the wallet balance and saves the entry. The balance never goes below zero (the SIM or
 * account cannot send more than it has); two counters using the same SIM at once cannot overspend it.
 */
export async function postWalletTxn(opts: {
  tid: Types.ObjectId;
  walletId: Types.ObjectId | string;
  branch?: Types.ObjectId;
  type: WalletTxnType;
  amount: number;
  fee?: number;
  commission?: number;
  walletEffect: number;
  cashEffect: number;
  method: "cash" | "bank" | "other";
  data?: Record<string, unknown>;
  user: { id: string; name: string };
}) {
  const need = opts.walletEffect < 0 ? -opts.walletEffect : 0;
  const w = await Wallet.findOneAndUpdate(
    { _id: opts.walletId, tenant: opts.tid, active: true, ...(opts.branch ? { branch: opts.branch } : {}), ...(need ? { balance: { $gte: need - 0.004 } } : {}) },
    { $inc: { balance: opts.walletEffect } },
    { new: true },
  ).lean();
  if (!w) {
    const exists = await Wallet.findOne({ _id: opts.walletId, tenant: opts.tid }).lean();
    if (!exists || !exists.active) throw new ApiError(404, "This account was not found or is switched off.");
    if (opts.branch && String(exists.branch) !== String(opts.branch)) throw new ApiError(400, `${exists.name} belongs to another branch.`);
    throw new ApiError(400, `Not enough balance in ${exists.name}: it has Rs ${round2(exists.balance)}, this needs Rs ${round2(need)}. Top it up first.`);
  }
  const balanceAfter = round2(w.balance);
  if (balanceAfter !== w.balance) await Wallet.updateOne({ _id: w._id, tenant: opts.tid }, { $set: { balance: balanceAfter } });
  try {
    const txnNo = await nextNumber(opts.tid, "walletTxn", "WTX");
    return await WalletTxn.create({
      tenant: opts.tid,
      txnNo,
      branch: w.branch,
      wallet: w._id,
      walletName: w.name,
      type: opts.type,
      amount: round2(opts.amount),
      fee: round2(opts.fee ?? 0),
      commission: round2(opts.commission ?? 0),
      walletEffect: round2(opts.walletEffect),
      cashEffect: round2(opts.cashEffect),
      method: opts.method,
      balanceAfter,
      ...opts.data,
      user: opts.user.id,
      userName: opts.user.name,
    });
  } catch (err) {
    // Saving the entry failed: undo the balance change.
    await Wallet.updateOne({ _id: w._id, tenant: opts.tid }, { $inc: { balance: -opts.walletEffect } });
    throw err;
  }
}

export function walletLabel(w: { name: string; provider: string }) {
  return w.name || PROVIDER_LABELS[w.provider] || w.provider;
}
