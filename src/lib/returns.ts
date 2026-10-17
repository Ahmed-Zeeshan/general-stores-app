import type { Types } from "mongoose";
import { ApiError } from "./api";
import { round2 } from "./money";
import { reversePoints } from "./loyalty";
import { moveStock, postLedger } from "./services";
import { restoreDevices } from "./devices";
import { drawerFor, drawerLink, noteLateEntry } from "./shifts";
import { DRAWER_CLOSED } from "./drawer-rule";
import { nextNumber, Sale, SaleReturn, Tenant } from "@/models";

export type ReturnLine = { index: number; qty: number; serials?: string[] };
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
  const items = lines.map((line) => {
    let l = line;
    const it = sale.items[l.index];
    if (!it) throw new ApiError(400, "Item not found on this bill.");
    if (seen.has(l.index)) throw new ApiError(400, "The same item is listed twice.");
    seen.add(l.index);
    // Phones: say which ones come back; the quantity is their number.
    let serials: { device: Types.ObjectId; imei: string; at: number }[] | undefined;
    if (it.serials?.length) {
      const wanted = l.serials ?? [];
      if (!wanted.length) throw new ApiError(400, `Choose which ${it.name} phone(s) are coming back (IMEI).`);
      if (new Set(wanted).size !== wanted.length) throw new ApiError(400, "The same phone is listed twice.");
      serials = wanted.map((id) => {
        const at = it.serials!.findIndex((x) => String(x.device) === id);
        if (at < 0) throw new ApiError(400, `That phone was not sold on this bill (${it.name}).`);
        if (it.serials![at].returned) throw new ApiError(400, `IMEI ${it.serials![at].imei} was already returned.`);
        return { device: it.serials![at].device as Types.ObjectId, imei: it.serials![at].imei ?? "", at };
      });
      l = { ...l, qty: serials.length };
    } else if (l.serials?.length) {
      throw new ApiError(400, `${it.name} is not tracked by IMEI.`);
    }
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
      ...(serials ? { serials } : {}),
    };
  });

  const willReturnAll = sale.items.every((it, i) => {
    const r = items.find((x) => x.index === i);
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
  /** Goods taken back on an installment plan: nothing is refunded and no khata entry is made. */
  installmentPlan?: string;
}) {
  const { tid } = opts;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sale = await loadSale(tid, opts.saleId);
    if (!sale) throw new ApiError(404, "Bill not found.");
    if (sale.status === "returned") throw new ApiError(400, "This bill has already been fully returned.");
    if (sale.installment && !opts.installmentPlan) {
      throw new ApiError(400, "This bill is on installments. To take the goods back, close the installment plan (Installments → plan → Take goods back).");
    }
    const lines =
      opts.lines && opts.lines.length
        ? opts.lines
        : sale.items
            .map((it, index) => ({
              index,
              qty: round3(it.qty - (it.returnedQty ?? 0)),
              ...(it.serials?.length ? { serials: it.serials.filter((x) => !x.returned).map((x) => String(x.device)) } : {}),
            }))
            .filter((l) => l.qty > 0);
    const priced = priceReturn(sale, lines);
    if (opts.installmentPlan) {
      // The plan keeps what was paid; the return only puts the goods back.
      priced.creditReduced = priced.total;
      priced.refund = 0;
    }

    // Default: give it back the way it was paid (cash for split-payment bills).
    const split = new Set((sale.payments ?? []).map((p) => p.method)).size > 1;
    let refundMethod: RefundMethod | "none" =
      opts.refundMethod ?? (!split && ["card", "jazzcash", "easypaisa", "bank"].includes(sale.paymentMethod) ? (sale.paymentMethod as RefundMethod) : "cash");
    if (refundMethod === "khata" && !sale.customer) throw new ApiError(400, "Only bills with a customer can be credited to a khata.");
    if (priced.refund <= 0) refundMethod = "none";

    // The refund comes out of the drawer open now at this branch (an offline return: the one open then).
    const drawer = await drawerFor(tid, opts.fallbackBranch, opts.at);
    if (refundMethod === "cash" && !drawer && !opts.at) {
      const t = await Tenant.findById(tid).select("requireOpenDrawer").lean();
      if (t?.requireOpenDrawer) throw new ApiError(409, DRAWER_CLOSED);
    }

    // Claim the bill: only succeeds if nobody returned from it since we read it.
    const inc: Record<string, number> = { returnSeq: 1, returnedTotal: priced.total, creditReturned: priced.creditReduced };
    // Points earned on the returned part are taken back (the last return takes what is left).
    const earned = sale.pointsEarned ?? 0;
    const already = sale.pointsReversed ?? 0;
    const pointsBack = earned > 0 && sale.customer ? Math.max(0, priced.willReturnAll ? earned - already : Math.min(earned - already, Math.round((earned * priced.total) / (sale.total || 1)))) : 0;
    if (pointsBack > 0) inc.pointsReversed = pointsBack;
    for (const it of priced.items) inc[`items.${it.index}.returnedQty`] = it.qty;
    // Put units back into the batches they were sold from (latest expiry first), never more than was taken.
    const restorePlan = new Map<number, { batch: Types.ObjectId; qty: number }[]>();
    for (const it of priced.items) {
      const batches = sale.items[it.index].batches ?? [];
      let left = it.qty;
      const plan: { batch: Types.ObjectId; qty: number }[] = [];
      for (const [m, b] of [...batches.entries()].reverse()) {
        const room = round3((b.qty ?? 0) - (b.returned ?? 0));
        const q = round3(Math.min(left, room));
        if (q > 0 && b.batch) {
          plan.push({ batch: b.batch, qty: q });
          inc[`items.${it.index}.batches.${m}.returned`] = q;
          left = round3(left - q);
        }
      }
      restorePlan.set(it.index, plan);
    }
    const set: Record<string, unknown> = { status: priced.willReturnAll ? "returned" : "partially_returned", returnedAt: opts.at ?? new Date() };
    for (const it of priced.items) for (const x of it.serials ?? []) set[`items.${it.index}.serials.${x.at}.returned`] = true;
    const claimed = await Sale.updateOne(
      // Bills saved before returns were tracked have no counter yet: treat missing as 0.
      { _id: sale._id, tenant: tid, returnSeq: sale.returnSeq ? sale.returnSeq : { $in: [0, null] } },
      { $inc: inc, $set: set },
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
      items: priced.items.map(({ serials, ...it }) => ({ ...it, ...(serials ? { serials: serials.map((x) => ({ device: x.device, imei: x.imei })) } : {}) })),
      subtotal: priced.subtotal,
      discount: priced.discount,
      tax: priced.tax,
      total: priced.total,
      costTotal: priced.costTotal,
      creditReduced: priced.creditReduced,
      refund: priced.refund,
      refundMethod,
      reason: opts.installmentPlan ? `Taken back on installment plan ${opts.installmentPlan}${opts.reason ? ` — ${opts.reason}` : ""}` : opts.reason,
      user: opts.user.id,
      userName: opts.user.name,
      fbrStatus: sale.fbrInvoiceNumber || sale.fbrStatus === "pending" ? "pending" : "none",
      ...drawerLink(drawer),
      ...(opts.at ? { createdAt: opts.at } : {}),
    });
    await noteLateEntry(tid, drawer, { kind: "return", ref: ret._id, no: returnNo, at: opts.at ?? new Date(), total: priced.total, cash: refundMethod === "cash" ? priced.refund : 0 });

    for (const it of priced.items) {
      if (it.serials?.length) {
        await restoreDevices({ tid, ids: it.serials.map((x) => x.device), branch, event: { action: "Returned by customer", refNo: returnNo, note: `from bill ${sale.invoiceNo}` }, userName: opts.user.name });
      }
      if (it.product) {
        await moveStock({
          serialOk: !!it.serials?.length,
          tid,
          branch,
          productId: it.product,
          qty: it.qty,
          type: "return",
          refNo: returnNo,
          note: `Return of ${sale.invoiceNo}`,
          userId: opts.user.id,
          batch: { restore: restorePlan.get(it.index), source: { type: "return", id: ret._id, refNo: returnNo } },
        });
      }
    }
    if (pointsBack > 0 && sale.customer) await reversePoints(tid, sale.customer, { points: pointsBack, returnId: ret._id, returnNo, userId: opts.user.id });
    const khataCredit = opts.installmentPlan ? 0 : round2(priced.creditReduced + (refundMethod === "khata" ? priced.refund : 0));
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
        branch,
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
