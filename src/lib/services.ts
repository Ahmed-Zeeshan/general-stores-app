import type { Types } from "mongoose";
import { LedgerEntry, Party, Product, StockLevel, StockMovement } from "@/models";
import { round2 } from "./money";
import { ApiError } from "./api";
import { batchExpiry, consumeBatches, createBatches, restoreBatches, type BatchAllocation, type IncomingBatch } from "./batches";

type Id = string | Types.ObjectId;

/** Atomically change a party's balance and write a khata entry with the running balance. */
export async function postLedger(opts: {
  tid: Types.ObjectId;
  partyId: Id;
  kind: "sale" | "purchase" | "payment" | "return" | "opening" | "adjustment" | "reversal";
  amount: number;
  method?: string;
  refType?: string;
  refId?: Id;
  refNo?: string;
  note?: string;
  userId?: Id;
  branch?: Id;
}) {
  const amount = round2(opts.amount);
  const party = await Party.findOneAndUpdate({ _id: opts.partyId, tenant: opts.tid }, { $inc: { balance: amount } }, { new: true });
  if (!party) throw new ApiError(404, "Customer/supplier not found.");
  const balanceAfter = round2(party.balance);
  if (balanceAfter !== party.balance) {
    await Party.updateOne({ _id: party._id, tenant: opts.tid }, { $set: { balance: balanceAfter } });
  }
  return LedgerEntry.create({
    tenant: opts.tid,
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
    branch: opts.branch,
  });
}

/**
 * Atomically change stock at one branch (and the product's shop-wide total) and record the
 * movement. qty is signed.
 */
export async function moveStock(opts: {
  tid: Types.ObjectId;
  branch: Types.ObjectId;
  productId: Id;
  qty: number;
  type: "sale" | "purchase" | "return" | "adjustment" | "wastage" | "opening" | "production" | "import" | "transfer" | "purchase_return" | "void" | "used_buy" | "repair" | "repossess";
  refNo?: string;
  note?: string;
  userId?: Id;
  /** The caller has added / taken the matching IMEI records (products with "track IMEI"). */
  serialOk?: boolean;
  /** Expiry batches (only used for products with "track expiry" on). */
  batch?: {
    /** Incoming: the batches that arrive (expiry date, batch no.). Default: one batch, expiry from shelf life. */
    incoming?: IncomingBatch[];
    /** Incoming: put back into these batches (customer return). */
    restore?: { batch: Id; qty: number }[];
    /** Outgoing: take from this batch first (write-off of one batch). */
    batchId?: Id;
    /** Outgoing: take from batches of this purchase first (return to supplier). */
    preferSource?: Id;
    source?: { type: string; id?: Id; refNo?: string };
  };
}) {
  const qty = Math.round(opts.qty * 1000) / 1000;
  // Phones (track IMEI): stock is the list of pieces, so it only changes together with them.
  if (!opts.serialOk) {
    const p = await Product.findOne({ _id: opts.productId, tenant: opts.tid }).select("trackSerial name").lean();
    if (p?.trackSerial) throw new ApiError(400, `${p.name} is tracked by IMEI. Add, sell or remove it by choosing the phones (IMEI), not by quantity.`);
  }
  const product = await Product.findOneAndUpdate({ _id: opts.productId, tenant: opts.tid }, { $inc: { stock: qty } }, { new: true });
  if (!product) return null;
  const level = await StockLevel.findOneAndUpdate(
    { tenant: opts.tid, product: product._id, branch: opts.branch },
    { $inc: { qty } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  // Keep values tidy (e.g. 0.30000000000000004 -> 0.3).
  const clean = (n: number) => Math.round(n * 1000) / 1000;
  if (clean(level.qty) !== level.qty) await StockLevel.updateOne({ _id: level._id, tenant: opts.tid }, { qty: clean(level.qty) });
  if (clean(product.stock) !== product.stock) await Product.updateOne({ _id: product._id, tenant: opts.tid }, { stock: clean(product.stock) });
  await StockMovement.create({
    tenant: opts.tid,
    branch: opts.branch,
    product: product._id,
    type: opts.type,
    qty,
    stockAfter: clean(level.qty),
    refNo: opts.refNo,
    note: opts.note,
    user: opts.userId,
  });
  let allocations: BatchAllocation[] = [];
  if (product.trackExpiry) {
    if (qty < 0) {
      allocations = await consumeBatches({ tid: opts.tid, branch: opts.branch, product: product._id, qty: -qty, batchId: opts.batch?.batchId, preferSource: opts.batch?.preferSource });
    } else if (qty > 0) {
      const restore = (opts.batch?.restore ?? []).filter((r) => r.qty > 0);
      const restored = clean(restore.reduce((a, r) => a + r.qty, 0));
      if (restore.length) await restoreBatches(opts.tid, restore);
      const rest = clean(qty - restored);
      if (rest > 0) {
        // An explicit empty list (e.g. a transfer of stock that had no batch) arrives without a date.
        const incoming = opts.batch?.incoming
          ? opts.batch.incoming.length
            ? opts.batch.incoming
            : [{ expiryDate: null }]
          : [{ expiryDate: restore.length ? null : batchExpiry(null, product.shelfLifeDays) }];
        allocations = await createBatches({
          tid: opts.tid,
          branch: opts.branch,
          product: product._id,
          qty: rest,
          batches: incoming,
          cost: product.costPrice ?? 0,
          source: opts.batch?.source ?? { type: opts.type, refNo: opts.refNo },
        });
      }
    }
  }
  return { product, branchQty: clean(level.qty), allocations };
}
