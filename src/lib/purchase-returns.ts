import type { Types } from "mongoose";
import { ApiError } from "./api";
import { branchStock } from "./branches";
import { round2 } from "./money";
import { moveStock, postLedger } from "./services";
import { claimDevices, undoClaim } from "./devices";
import { Device, nextNumber, Purchase, PurchaseReturn } from "@/models";

export type PurchaseReturnLine = { index: number; qty: number; serials?: string[] };
const round3 = (n: number) => Math.round(n * 1000) / 1000;

type User = { id: string; name: string };

/** Makes sure the branch still has the stock that is about to leave it. */
async function checkStock(tid: Types.ObjectId, branch: Types.ObjectId, branchName: string | null | undefined, need: { product: Types.ObjectId; name: string; unit?: string | null; qty: number }[]) {
  const levels = await branchStock(tid, branch, need.map((n) => n.product));
  const total = new Map<string, number>();
  for (const n of need) total.set(String(n.product), (total.get(String(n.product)) ?? 0) + n.qty);
  for (const n of need) {
    const have = levels.get(String(n.product)) ?? 0;
    if (have + 0.0005 < (total.get(String(n.product)) ?? 0)) {
      throw new ApiError(400, `Only ${round3(have)} ${n.unit ?? ""} of ${n.name} is in stock at ${branchName ?? "this branch"}. Some of it was already sold.`.replace(/\s+/g, " "));
    }
  }
}

/** Sends some or all items of a purchase back to the supplier. */
export async function createPurchaseReturn(opts: {
  tid: Types.ObjectId;
  purchaseId: string;
  lines?: PurchaseReturnLine[];
  settlement?: "khata" | "cash";
  reason?: string;
  user: User;
}) {
  const { tid } = opts;
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = await Purchase.findOne({ _id: opts.purchaseId, tenant: tid }).lean();
    if (!p) throw new ApiError(404, "Purchase not found.");
    if (p.status === "void") throw new ApiError(400, "This purchase was cancelled.");
    if (p.status === "returned") throw new ApiError(400, "Everything in this purchase has already been returned.");

    const lines =
      opts.lines && opts.lines.length
        ? opts.lines
        : p.items
            .map((it, index) => ({
              index,
              qty: round3(it.qty - (it.returnedQty ?? 0)),
              ...(it.serials?.length ? { serials: it.serials.filter((x) => !x.returned).map((x) => String(x.device)) } : {}),
            }))
            .filter((l) => l.qty > 0);
    if (!lines.length) throw new ApiError(400, "Choose at least one item to return.");
    const seen = new Set<number>();
    const items = lines.map((line) => {
      let l = line;
      const it = p.items[l.index];
      if (!it) throw new ApiError(400, "Item not found on this purchase.");
      if (seen.has(l.index)) throw new ApiError(400, "The same item is listed twice.");
      seen.add(l.index);
      // Phones: which ones go back; the quantity is their number.
      let serials: { device: Types.ObjectId; imei: string; at: number }[] | undefined;
      if (it.serials?.length) {
        if (!l.serials?.length) throw new ApiError(400, `Choose which ${it.name} phone(s) go back (IMEI).`);
        serials = l.serials.map((id) => {
          const at = it.serials!.findIndex((x) => String(x.device) === id);
          if (at < 0) throw new ApiError(400, `That phone is not on this purchase (${it.name}).`);
          if (it.serials![at].returned) throw new ApiError(400, `IMEI ${it.serials![at].imei} was already returned.`);
          return { device: it.serials![at].device as Types.ObjectId, imei: it.serials![at].imei ?? "", at };
        });
        l = { ...l, qty: serials.length };
      } else if (l.serials?.length) throw new ApiError(400, `${it.name} is not tracked by IMEI.`);
      const left = round3(it.qty - (it.returnedQty ?? 0));
      if (!(l.qty > 0)) throw new ApiError(400, `Quantity for ${it.name} must be more than zero.`);
      if (l.qty > left + 0.0005) throw new ApiError(400, `Only ${left} of ${it.name} can still be returned.`);
      return { index: l.index, product: it.product, name: it.name, unit: it.unit, qty: round3(l.qty), cost: it.cost, total: round2(it.cost * l.qty), ...(serials ? { serials } : {}) };
    });
    const all = p.items.every((it, i) => round3((it.returnedQty ?? 0) + (items.find((x) => x.index === i)?.qty ?? 0)) >= it.qty - 0.0005);
    let total = round2(items.reduce((a, i) => a + i.total, 0));
    if (all) total = round2(p.total - (p.returnedTotal ?? 0)); // no rounding left over

    const settlement = opts.settlement ?? (p.supplier ? "khata" : "cash");
    if (settlement === "khata" && !p.supplier) throw new ApiError(400, "This purchase has no supplier khata. Choose cash back.");
    await checkStock(tid, p.branch!, p.branchName, items);

    // Phones first (all or nothing): they must still be in stock.
    const ops: string[] = [];
    try {
      for (const it of items) {
        if (!it.serials?.length) continue;
        const { op } = await claimDevices({ tid, ids: it.serials.map((x) => x.device), productId: it.product, branch: p.branch!, sourceId: p._id, to: "returned", event: { action: "Returned to supplier", note: p.supplierName ?? undefined }, userName: opts.user.name });
        ops.push(op);
      }
    } catch (err) {
      for (const op of ops) await undoClaim(tid, op);
      throw err;
    }
    const inc: Record<string, number> = { returnSeq: 1, returnedTotal: total };
    const set: Record<string, unknown> = { status: all ? "returned" : "partially_returned" };
    for (const it of items) {
      inc[`items.${it.index}.returnedQty`] = it.qty;
      for (const x of it.serials ?? []) set[`items.${it.index}.serials.${x.at}.returned`] = true;
    }
    const claimed = await Purchase.updateOne(
      { _id: p._id, tenant: tid, returnSeq: p.returnSeq ? p.returnSeq : { $in: [0, null] }, status: { $in: ["received", "partially_returned", null] } },
      { $inc: inc, $set: set },
    );
    if (!claimed.modifiedCount) {
      for (const op of ops) await undoClaim(tid, op);
      continue;
    }

    const returnNo = await nextNumber(tid, "purchaseReturn", "PRN");
    if (ops.length) await Device.updateMany({ tenant: tid, "history.op": { $in: ops } }, { $set: { "history.$[e].refNo": returnNo } }, { arrayFilters: [{ "e.op": { $in: ops } }] });

    const ret = await PurchaseReturn.create({
      tenant: tid,
      returnNo,
      purchase: p._id,
      purchaseNo: p.purchaseNo,
      branch: p.branch,
      branchName: p.branchName,
      supplier: p.supplier,
      supplierName: p.supplierName,
      items: items.map(({ serials, ...it }) => ({ ...it, ...(serials ? { serials: serials.map((x) => ({ device: x.device, imei: x.imei })) } : {}) })),
      total,
      settlement,
      reason: opts.reason,
      user: opts.user.id,
      userName: opts.user.name,
    });
    for (const it of items) {
      await moveStock({ tid, branch: p.branch!, productId: it.product, qty: -it.qty, type: "purchase_return", refNo: returnNo, note: `Returned to supplier (${p.purchaseNo})`, userId: opts.user.id, batch: { preferSource: p._id }, serialOk: !!it.serials?.length });
    }
    if (p.supplier && settlement === "khata") {
      await postLedger({
        tid,
        partyId: p.supplier,
        kind: "return",
        amount: -total,
        refType: "purchase_return",
        refId: ret._id,
        refNo: returnNo,
        note: `Goods returned from ${p.purchaseNo}`,
        userId: opts.user.id,
        branch: p.branch ?? undefined,
      });
    }
    return ret.toObject();
  }
  throw new ApiError(409, "This purchase was changed by someone else just now. Please try again.");
}

/** Cancels a purchase entered by mistake: stock, supplier khata and payment are all reversed. */
export async function voidPurchase(opts: { tid: Types.ObjectId; purchaseId: string; reason?: string; user: User }) {
  const { tid } = opts;
  const p = await Purchase.findOne({ _id: opts.purchaseId, tenant: tid }).lean();
  if (!p) throw new ApiError(404, "Purchase not found.");
  if (p.status === "void") throw new ApiError(400, "This purchase is already cancelled.");
  if ((p.returnedTotal ?? 0) > 0) throw new ApiError(400, "Some items of this purchase were already returned. Return the rest instead of cancelling.");
  await checkStock(tid, p.branch!, p.branchName, p.items);
  // Phones bought on it must all still be in stock; they are removed with the purchase.
  const ops: string[] = [];
  try {
    for (const it of p.items) {
      if (!it.serials?.length) continue;
      const { op } = await claimDevices({ tid, ids: it.serials.map((x) => x.device!), productId: it.product, branch: p.branch!, sourceId: p._id, to: "removed", event: { action: "Purchase cancelled", refNo: p.purchaseNo, note: opts.reason }, userName: opts.user.name });
      ops.push(op);
    }
  } catch (err) {
    for (const op of ops) await undoClaim(tid, op);
    throw err;
  }

  const claimed = await Purchase.updateOne(
    { _id: p._id, tenant: tid, returnSeq: p.returnSeq ? p.returnSeq : { $in: [0, null] }, status: { $in: ["received", null] } },
    { $inc: { returnSeq: 1 }, $set: { status: "void", voidedAt: new Date(), voidedBy: opts.user.id, voidedByName: opts.user.name, voidReason: opts.reason } },
  );
  if (!claimed.modifiedCount) {
    for (const op of ops) await undoClaim(tid, op);
    throw new ApiError(409, "This purchase was changed by someone else just now. Please refresh.");
  }

  for (const it of p.items) {
    await moveStock({ tid, branch: p.branch!, productId: it.product, qty: -it.qty, type: "void", refNo: p.purchaseNo, note: `Purchase cancelled${opts.reason ? `: ${opts.reason}` : ""}`, userId: opts.user.id, batch: { preferSource: p._id }, serialOk: !!it.serials?.length });
  }
  if (p.supplier) {
    await postLedger({ tid, partyId: p.supplier, kind: "adjustment", amount: -p.total, refType: "purchase", refId: p._id, refNo: p.purchaseNo, note: `Purchase ${p.purchaseNo} cancelled`, userId: opts.user.id, branch: p.branch ?? undefined });
    if (p.amountPaid > 0) {
      await postLedger({ tid, partyId: p.supplier, kind: "reversal", amount: p.amountPaid, method: "cash", refType: "purchase", refId: p._id, refNo: p.purchaseNo, note: `Payment for ${p.purchaseNo} cancelled`, userId: opts.user.id, branch: p.branch ?? undefined });
    }
  }
  return Purchase.findOne({ _id: p._id, tenant: tid }).lean();
}
