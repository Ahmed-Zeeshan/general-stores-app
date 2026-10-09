import type { Types } from "mongoose";
import { LedgerEntry, Party, Product, StockMovement } from "@/models";
import { round2 } from "./money";
import { ApiError } from "./api";

type Id = string | Types.ObjectId;

/** Atomically change a party's balance and write a khata entry with the running balance. */
export async function postLedger(opts: {
  partyId: Id;
  kind: "sale" | "purchase" | "payment" | "return" | "opening" | "adjustment";
  amount: number;
  method?: string;
  refType?: string;
  refId?: Id;
  refNo?: string;
  note?: string;
  userId?: Id;
}) {
  const amount = round2(opts.amount);
  const party = await Party.findByIdAndUpdate(opts.partyId, { $inc: { balance: amount } }, { new: true });
  if (!party) throw new ApiError(404, "Customer/supplier not found.");
  // Keep the stored balance rounded after the increment.
  const balanceAfter = round2(party.balance);
  if (balanceAfter !== party.balance) {
    await Party.updateOne({ _id: party._id }, { $set: { balance: balanceAfter } });
  }
  return LedgerEntry.create({
    party: party._id,
    kind: opts.kind,
    amount,
    balanceAfter,
    method: opts.method,
    refType: opts.refType,
    refId: opts.refId,
    refNo: opts.refNo,
    note: opts.note,
    user: opts.userId,
  });
}

/** Atomically change stock and record the movement. qty is signed. */
export async function moveStock(opts: {
  productId: Id;
  qty: number;
  type: "sale" | "purchase" | "return" | "adjustment" | "wastage" | "opening";
  refNo?: string;
  note?: string;
  userId?: Id;
}) {
  const qty = Math.round(opts.qty * 1000) / 1000;
  const product = await Product.findByIdAndUpdate(opts.productId, { $inc: { stock: qty } }, { new: true });
  if (!product) return null;
  await StockMovement.create({
    product: product._id,
    type: opts.type,
    qty,
    stockAfter: product.stock,
    refNo: opts.refNo,
    note: opts.note,
    user: opts.userId,
  });
  return product;
}
