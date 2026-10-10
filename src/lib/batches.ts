import type { Types } from "mongoose";
import { StockBatch, StockLevel } from "@/models";

type Id = string | Types.ObjectId;

/** Part of a stock movement that came from (or went back to) one batch. */
export type BatchAllocation = { batch: Types.ObjectId; qty: number; expiryDate?: Date | null; batchNo?: string | null };
/** A new batch to create: what arrives with an expiry date. */
export type IncomingBatch = { qty?: number; expiryDate?: Date | null; batchNo?: string | null; cost?: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const DAY = 864e5;

/**
 * A lot is good until the end of its expiry date (shop time). A plain date ("2026-10-09", stored
 * as UTC midnight) and a date-time both become 23:59:59 of that calendar day.
 */
export function expiryEndOfDay(d: Date) {
  const plain = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return plain ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Whole calendar days from today to the expiry date (0 = expires today, -1 = expired yesterday). */
export function daysUntil(expiry: Date, now = new Date()) {
  const a = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / DAY);
}

/** Expiry for a new batch: the date given, or today + shelf life. */
export function batchExpiry(given: Date | null | undefined, shelfLifeDays?: number | null) {
  if (given) return expiryEndOfDay(given);
  if (shelfLifeDays && shelfLifeDays > 0) return expiryEndOfDay(new Date(Date.now() + shelfLifeDays * DAY));
  return null;
}

/** Order to sell in: not-yet-expired first by expiry date, then batches with no date, expired last. */
function fefo<T extends { expiryDate?: Date | null; createdAt?: Date | null }>(list: T[], now = Date.now()) {
  const rank = (b: T) => (!b.expiryDate ? 1 : b.expiryDate.getTime() < now ? 2 : 0);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.expiryDate?.getTime() ?? 0) - (b.expiryDate?.getTime() ?? 0) ||
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );
}

export async function createBatches(opts: {
  tid: Types.ObjectId;
  branch: Id;
  product: Id;
  qty: number;
  batches?: IncomingBatch[];
  cost?: number;
  source?: { type: string; id?: Id; refNo?: string };
}) {
  // Split the quantity over the batches given (e.g. a transfer of two lots); the rest is one batch.
  const parts: IncomingBatch[] = [];
  let left = round3(opts.qty);
  for (const b of opts.batches ?? []) {
    const q = round3(Math.min(left, b.qty ?? left));
    if (q > 0) parts.push({ ...b, qty: q });
    left = round3(left - q);
  }
  if (left > 0) parts.push({ qty: left, expiryDate: null });
  const docs = parts.map((p) => ({
    tenant: opts.tid,
    branch: opts.branch,
    product: opts.product,
    qty: p.qty!,
    initialQty: p.qty!,
    expiryDate: p.expiryDate ? expiryEndOfDay(p.expiryDate) : null,
    batchNo: p.batchNo ?? undefined,
    cost: p.cost ?? opts.cost ?? 0,
    sourceType: opts.source?.type,
    sourceId: opts.source?.id,
    refNo: opts.source?.refNo,
  }));
  const created = await StockBatch.insertMany(docs);
  return created.map((b) => ({ batch: b._id, qty: b.qty, expiryDate: b.expiryDate, batchNo: b.batchNo }));
}

/**
 * Takes `qty` out of the batches of a product at a branch: a specific batch, then batches from
 * `preferSource` (e.g. the purchase being returned), then FEFO. Stock without a batch is simply
 * not tracked, so this never fails.
 */
export async function consumeBatches(opts: { tid: Types.ObjectId; branch: Id; product: Id; qty: number; batchId?: Id; preferSource?: Id }) {
  const out: BatchAllocation[] = [];
  let left = round3(opts.qty);
  for (let attempt = 0; attempt < 5 && left > 0; attempt++) {
    const list = await StockBatch.find({ tenant: opts.tid, branch: opts.branch, product: opts.product, qty: { $gt: 0 } }).lean();
    const ordered = [
      ...list.filter((b) => opts.batchId && String(b._id) === String(opts.batchId)),
      ...fefo(list.filter((b) => opts.preferSource && String(b.sourceId) === String(opts.preferSource) && String(b._id) !== String(opts.batchId))),
      ...fefo(list.filter((b) => String(b._id) !== String(opts.batchId) && !(opts.preferSource && String(b.sourceId) === String(opts.preferSource)))),
    ];
    if (!ordered.length) break;
    let raced = false;
    for (const b of ordered) {
      if (left <= 0) break;
      const take = round3(Math.min(left, b.qty));
      const res = await StockBatch.updateOne({ _id: b._id, tenant: opts.tid, qty: { $gte: take } }, { $inc: { qty: -take } });
      if (!res.modifiedCount) {
        raced = true; // someone else took from it at the same moment: read again
        break;
      }
      out.push({ batch: b._id, qty: take, expiryDate: b.expiryDate, batchNo: b.batchNo });
      left = round3(left - take);
    }
    if (!raced) break;
  }
  return out;
}

/** Puts stock back into the batches it came from (customer returns). */
export async function restoreBatches(tid: Types.ObjectId, allocations: { batch: Id; qty: number }[]) {
  for (const a of allocations) {
    if (a.qty > 0) await StockBatch.updateOne({ _id: a.batch, tenant: tid }, { $inc: { qty: round3(a.qty) } });
  }
}

/**
 * When expiry tracking is switched on, the stock already on the shelves becomes one batch per
 * branch (with the product's single expiry date, if it had one) so batches match the stock.
 */
export async function startBatches(tid: Types.ObjectId, product: { _id: Types.ObjectId; expiryDate?: Date | null; costPrice?: number | null }) {
  const levels = await StockLevel.find({ tenant: tid, product: product._id, qty: { $gt: 0 } }).lean();
  for (const l of levels) {
    const inBatches = await StockBatch.aggregate([
      { $match: { tenant: tid, branch: l.branch, product: product._id, qty: { $gt: 0 } } },
      { $group: { _id: null, qty: { $sum: "$qty" } } },
    ]);
    const missing = round3(l.qty - (inBatches[0]?.qty ?? 0));
    if (missing > 0) {
      await createBatches({ tid, branch: l.branch, product: product._id, qty: missing, batches: [{ expiryDate: product.expiryDate ?? null }], cost: product.costPrice ?? 0, source: { type: "start" } });
    }
  }
}
