import type { Types } from "mongoose";
import { ApiError } from "./api";
import { round2 } from "./money";
import { moveStock, postLedger } from "./services";
import { nextNumber, Sale, SaleReturn } from "@/models";

export type ReturnLine = { index: number; qty: number };
export type RefundMethod = "cash" | "card" | "jazzcash" | "easypaisa" | "bank" | "khata";

type SaleLean = NonNullable<Awaited<ReturnType<typeof loadSale>>>;
function loadSale(tid: Types.ObjectId, saleId: string) {
  return Sale.findOne({ _id: saleId, tenant: tid }).lean();
}

/**
 * Works out the value of returning `lines` from a bill. Each line keeps its share of the bill
 * discount and tax, and the last return of a bill always uses exactly what is left, so the bill
 * and its returns add up to the paisa.
 */
export function priceReturn(sale: SaleLean, lines: ReturnLine[]) {
  if (!lines.length) throw new ApiError(400, "Choose at least one item to return.");
  const seen = new Set<number>();
  const items = lines.map((l) => {
    const it = sale.items[l.index];
    if (!it) throw new ApiError(400, "Item not found on this bill.");
    if (seen.has(l.index)) throw new ApiError(400, "The same item is listed twice.");
    seen.add(l.index);
    const left = round3(it.qty - (it.returnedQty ?? 0));
    if (!(l.qty > 0)) throw new ApiError(400, `Quantity for ${it.name} must be more than zero.`);
    if (l.qty > left + 0.0005) throw new ApiError(400, `Only ${left} of ${it.name} can still be returned.`);
    const share = l.qty / it.qty;
    return {
      index: l.index,
      product: it.product,
      name: it.name,
      unit: it.unit,
      qty: round3(l.qty),
      price: it.price,
      total: round2(it.total * share),
      cost: round2((it.cost ?? 0) * l.qty),
    };
  });

  const willReturnAll = sale.items.every((it, i) => {
    const r = lines.find((l) => l.index === i);
    return round3((it.returnedQty ?? 0) + (r?.qty ?? 0)) >= it.qty - 0.0005;
  });

  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 0; // discount and (exclusive) tax
  let total = round2(subtotal * ratio);
  if (willReturnAll) total = round2(sale.total - (sale.returnedTotal ?? 0)); // no rounding left over
  total = Math.max(0, Math.min(total, round2(sale.total - (sale.returnedTotal ?? 0))));
  const discount = sale.subtotal > 0 ? round2((sale.discount * subtotal) / sale.subtotal) : 0;
  const tax = sale.total > 0 ? round2((sale.tax * total) / sale.total) : 0;
  const costTotal = round2(items.reduce((s, i) => s + i.cost, 0));
  const creditLeft = round2((sale.creditAmount ?? 0) - (sale.creditReturned ?? 0));
  const creditReduced = round2(Math.min(total, Math.max(0, creditLeft)));
  return { items, subtotal, discount, tax, total, costTotal, creditReduced, refund: round2(total - creditReduced), willReturnAll };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Records a return: stock back to the selling branch, khata adjusted, bill updated. */
export async function createReturn(opts: {
  tid: Types.ObjectId;
  saleId: string;
  lines?: ReturnLine[];
  refundMethod?: RefundMethod;
  reason?: string;
  user: { id: string; name: string };
  fallbackBranch: Types.ObjectId;
  at?: Date;
}) {
  const { tid } = opts;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sale = await loadSale(tid, opts.saleId);
    if (!sale) throw new ApiError(404, "Bill not found.");
    if (sale.status === "returned") throw new ApiError(400, "This bill has already been fully returned.");
    const lines =
      opts.lines && opts.lines.length
        ? opts.lines
        : sale.items.map((it, index) => ({ index, qty: round3(it.qty - (it.returnedQty ?? 0)) })).filter((l) => l.qty > 0);
    const priced = priceReturn(sale, lines);

    // Default: give it back the way it was paid (cash for split-payment bills).
    const split = new Set((sale.payments ?? []).map((p) => p.method)).size > 1;
    let refundMethod: RefundMethod | "none" =
      opts.refundMethod ?? (!split && ["card", "jazzcash", "easypaisa", "bank"].includes(sale.paymentMethod) ? (sale.paymentMethod as RefundMethod) : "cash");
    if (refundMethod === "khata" && !sale.customer) throw new ApiError(400, "Only bills with a customer can be credited to a khata.");
    if (priced.refund <= 0) refundMethod = "none";

    // Claim the bill: only succeeds if nobody returned from it since we read it.
    const inc: Record<string, number> = { returnSeq: 1, returnedTotal: priced.total, creditReturned: priced.creditReduced };
    for (const it of priced.items) inc[`items.${it.index}.returnedQty`] = it.qty;
    const claimed = await Sale.updateOne(
      { _id: sale._id, tenant: tid, returnSeq: sale.returnSeq ?? 0 },
      {
        $inc: inc,
        $set: { status: priced.willReturnAll ? "returned" : "partially_returned", returnedAt: opts.at ?? new Date() },
      },
    );
    if (!claimed.modifiedCount) continue; // someone else returned at the same moment: try again with fresh data

    const returnNo = await nextNumber(tid, "return", "RTN");
    const branch = sale.branch ?? opts.fallbackBranch;
    const ret = await SaleReturn.create({
      tenant: tid,
      returnNo,
      sale: sale._id,
      invoiceNo: sale.invoiceNo,
      branch,
      branchName: sale.branchName,
      customer: sale.customer,
      customerName: sale.customerName,
      items: priced.items,
      subtotal: priced.subtotal,
      discount: priced.discount,
      tax: priced.tax,
      total: priced.total,
      costTotal: priced.costTotal,
      creditReduced: priced.creditReduced,
      refund: priced.refund,
      refundMethod,
      reason: opts.reason,
      user: opts.user.id,
      userName: opts.user.name,
      fbrStatus: sale.fbrInvoiceNumber || sale.fbrStatus === "pending" ? "pending" : "none",
      ...(opts.at ? { createdAt: opts.at } : {}),
    });

    for (const it of priced.items) {
      if (it.product) {
        await moveStock({ tid, branch, productId: it.product, qty: it.qty, type: "return", refNo: returnNo, note: `Return of ${sale.invoiceNo}`, userId: opts.user.id });
      }
    }
    const khataCredit = round2(priced.creditReduced + (refundMethod === "khata" ? priced.refund : 0));
    if (sale.customer && khataCredit > 0) {
      await postLedger({
        tid,
        partyId: sale.customer,
        kind: "return",
        amount: -khataCredit,
        refType: "return",
        refId: ret._id,
        refNo: returnNo,
        note: `Return ${returnNo} of bill ${sale.invoiceNo}`,
        userId: opts.user.id,
      });
    }
    return ret.toObject();
  }
  throw new ApiError(409, "This bill was changed by someone else just now. Please try again.");
}

/** Bills returned before item-level returns existed get a matching return record (runs once per shop). */
export async function migrateLegacyReturns(tid: Types.ObjectId) {
  const legacy = await Sale.find({ tenant: tid, status: "returned", returnedTotal: { $in: [0, null] } }).lean();
  for (const sale of legacy) {
    if (await SaleReturn.exists({ tenant: tid, sale: sale._id })) continue;
    const returnNo = await nextNumber(tid, "return", "RTN");
    await SaleReturn.create({
      tenant: tid,
      returnNo,
      sale: sale._id,
      invoiceNo: sale.invoiceNo,
      branch: sale.branch,
      branchName: sale.branchName,
      customer: sale.customer,
      customerName: sale.customerName,
      items: sale.items.map((it, index) => ({ index, product: it.product, name: it.name, unit: it.unit, qty: it.qty, price: it.price, total: it.total, cost: round2((it.cost ?? 0) * it.qty) })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      total: sale.total,
      costTotal: sale.costTotal,
      creditReduced: sale.creditAmount,
      refund: round2(sale.total - sale.creditAmount),
      refundMethod: sale.total - sale.creditAmount > 0 ? "cash" : "none",
      fbrStatus: sale.fbrReturnInvoiceNumber ? "synced" : "none",
      fbrInvoiceNumber: sale.fbrReturnInvoiceNumber,
      createdAt: sale.returnedAt ?? sale.updatedAt,
    });
    await Sale.updateOne(
      { _id: sale._id, tenant: tid },
      {
        $set: {
          returnedTotal: sale.total,
          creditReturned: sale.creditAmount,
          ...Object.fromEntries(sale.items.map((it, i) => [`items.${i}.returnedQty`, it.qty])),
        },
      },
    );
  }
}
