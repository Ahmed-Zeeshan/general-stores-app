import { z } from "zod";
import { ApiError } from "./api";
import { logActivity } from "./activity";
import type { BranchContext } from "./branches";
import { syncSaleToFbr } from "./fbr";
import { round2 } from "./money";
import { recordPoints } from "./loyalty";
import { findPack, sellPrice } from "./pricing";
import { applyPromotions, pointsEarned, type PromoLike, type PromoLine } from "./promotions";
import { optionalId } from "./schemas";
import { moveStock, postLedger } from "./services";
import { addMonths, claimDevices, linkSale, undoClaim } from "./devices";
import { Device, nextNumber, PAYMENT_METHODS, Party, Product, Promotion, Sale, TENDER_METHODS, Tenant, User } from "@/models";

export const SaleBody = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i),
        qty: z.coerce.number().positive("Quantity must be more than zero"),
        /** Price per item sold (per pack when `pack` is given). Owner/manager only. */
        price: z.coerce.number().min(0).optional(),
        discount: z.coerce.number().min(0).default(0),
        /** Sell in a pack size of the product, e.g. "Carton"; qty is then the number of packs. */
        pack: z.string().trim().max(30).optional(),
        /** Phones (products with "track IMEI"): the pieces sold; qty must equal their number. */
        serials: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).optional(),
      }),
    )
    .min(1, "Add at least one item"),
  discount: z.coerce.number().min(0).default(0),
  /** Single payment: method and amount received (omitted = paid in full, or nothing for udhaar). */
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  amountPaid: z.coerce.number().min(0).optional(),
  /** Loyalty points the customer spends on this bill. */
  redeemPoints: z.coerce.number().int().min(0).max(10_000_000).optional(),
  /** Transaction ID for a single card / JazzCash / Easypaisa / bank payment. */
  paymentRef: z.string().trim().max(40).optional(),
  /** Split payment: several methods for one bill. Cash may be more than needed (change is given). */
  payments: z
    .array(z.object({ method: z.enum(TENDER_METHODS), amount: z.coerce.number().min(0), ref: z.string().trim().max(40).optional() }))
    .max(10)
    .optional(),
  customerId: optionalId,
  note: z.string().trim().optional(),
  // Offline bills (made while the server was unreachable) are sent later with these:
  clientId: z.string().trim().min(8).max(64).optional(),
  soldAt: z.string().datetime().optional(),
  branchId: optionalId,
});

export type SaleInput = z.infer<typeof SaleBody>;

/**
 * Makes a bill: prices, offers, points, payments, stock (and phones by IMEI), khata and FBR.
 * `installment`: the unpaid part goes to an installment plan instead of the khata (no credit limit).
 */
/** A bill sent this long after it was made is treated as made offline. */
const OFFLINE_MIN_AGE_MS = 2 * 60_000;

export async function createSale(ctx: BranchContext, body: SaleInput, opts: { installment?: boolean } = {}) {
  const { user, tid } = ctx;

  // Re-sending the same offline bill returns the bill already saved instead of a duplicate.
  if (body.clientId) {
    const existing = await Sale.findOne({ tenant: tid, clientId: body.clientId }).lean();
    if (existing) return existing;
  }
  let soldAt: Date | undefined;
  let offline = false;
  if (body.clientId && body.soldAt) {
    soldAt = new Date(body.soldAt);
    const age = Date.now() - soldAt.getTime();
    if (age > 30 * 864e5 || age < -10 * 60_000) throw new ApiError(400, "Offline bill date is not valid. Check this device's date and time.");
    // Only a bill really made earlier counts as offline (one dated "now" is an ordinary bill with ordinary limits).
    offline = age >= OFFLINE_MIN_AGE_MS;
  }
  // Offline bills keep the branch they were made in (if the user may use it).
  let branch = ctx.branch;
  if (body.branchId && body.branchId !== String(ctx.branchId)) {
    const b = ctx.locked ? undefined : ctx.branches.find((x) => String(x._id) === body.branchId);
    if (!b) throw new ApiError(403, "You cannot make bills for that branch.");
    branch = b;
  }
  const settings = await Tenant.findById(tid).lean();

  const products = await Product.find({ tenant: tid, _id: { $in: body.items.map((i) => i.productId) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  let customer = null;
  if (body.customerId) {
    customer = await Party.findOne({ _id: body.customerId, tenant: tid, type: "customer" }).lean();
    if (!customer) throw new ApiError(400, "Customer not found.");
  }
  const wholesale = customer?.priceLevel === "wholesale";
  const priceChanges: string[] = [];
  // Phones sold by IMEI: each piece may have its own price and cost.
  const serialIds = body.items.flatMap((i) => i.serials ?? []);
  const devices = serialIds.length ? await Device.find({ tenant: tid, _id: { $in: serialIds } }).lean() : [];
  const deviceById = new Map(devices.map((d) => [String(d._id), d]));
  const promoLines: PromoLine[] = [];

  const items = body.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new ApiError(400, "One of the products no longer exists. Please refresh.");
    const pack = findPack(p, i.pack);
    if (i.pack && !pack) throw new ApiError(400, `${p.name} is not sold in "${i.pack}" any more. Please refresh.`);
    let pieces: NonNullable<ReturnType<typeof deviceById.get>>[] = [];
    if (p.trackSerial) {
      if (!i.serials?.length) throw new ApiError(400, `Choose which ${p.name} is being sold (IMEI).`);
      if (i.pack) throw new ApiError(400, `${p.name} is sold one piece at a time (by IMEI).`);
      if (i.qty !== i.serials.length) throw new ApiError(400, `${p.name}: quantity must match the number of phones chosen (${i.serials.length}).`);
      pieces = i.serials.map((id) => {
        const d = deviceById.get(id);
        if (!d || String(d.product) !== String(p._id)) throw new ApiError(400, `One of the chosen ${p.name} phones was not found. Please refresh.`);
        return d;
      });
    } else if (i.serials?.length) {
      throw new ApiError(400, `${p.name} is not tracked by IMEI.`);
    }
    // Cashiers always sell at the saved price; owner/manager may change the price at the counter.
    // A single phone with its own asking price (used phones) is sold at that price.
    const listPrice = pieces.length === 1 && pieces[0].price ? pieces[0].price : sellPrice(p, pack, wholesale);
    const price = user.role === "cashier" || i.price === undefined ? listPrice : i.price;
    if (Math.abs(price - listPrice) > 0.004) priceChanges.push(`${p.name}${pack ? ` (${pack.name})` : ""} ${listPrice} → ${price}`);
    const gross = round2(i.qty * price);
    const discount = Math.min(round2(i.discount), gross);
    const qty = pack ? Math.round(i.qty * pack.size * 1000) / 1000 : i.qty;
    promoLines.push({
      productId: String(p._id),
      categoryId: p.category ? String(p.category) : null,
      qty,
      unitPrice: pack ? price / pack.size : price,
      gross,
      manualDiscount: discount,
      isPack: !!pack,
      customPrice: Math.abs(price - listPrice) > 0.004,
    });
    return {
      product: p._id,
      name: p.name,
      unit: p.unit,
      qty,
      price: pack ? Math.round((price / pack.size) * 10000) / 10000 : price,
      // Phones: the real cost of the pieces sold.
      cost: pieces.length ? Math.round((pieces.reduce((a, d) => a + (d.cost ?? 0), 0) / pieces.length) * 100) / 100 : (p.costPrice ?? 0),
      discount,
      total: round2(gross - discount),
      ...(pack ? { pack: { name: pack.name, size: pack.size, count: i.qty, price } } : {}),
      ...(wholesale ? { wholesale: true } : {}),
      ...(pieces.length
        ? {
            serials: pieces.map((d) => ({ device: d._id, imei: d.imei, ...(d.imei2 ? { imei2: d.imei2 } : {}) })),
            ...(p.warrantyMonths ? { warrantyMonths: p.warrantyMonths, warrantyUntil: addMonths(soldAt ?? new Date(), p.warrantyMonths) } : {}),
          }
        : {}),
    };
  });

  // Offers run automatically (not for wholesale customers or prices typed by hand).
  const manualLineDiscount = round2(items.reduce((a, i) => a + i.discount, 0));
  const promos = wholesale ? [] : ((await Promotion.find({ tenant: tid, active: true }).lean()) as unknown as PromoLike[]);
  const applied = applyPromotions(promoLines, promos, { wholesale, now: soldAt ?? new Date() });
  for (const [i, lp] of applied.lines.entries()) {
    if (!lp) continue;
    const it = items[i] as (typeof items)[number] & { promo?: { name: string; amount: number } };
    it.discount = round2(it.discount + lp.discount);
    it.total = round2(it.total - lp.discount);
    it.promo = { name: lp.name, amount: lp.discount };
  }
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const billPromo = applied.bill ? Math.min(applied.bill.discount, subtotal) : 0;
  let discount = Math.min(round2(body.discount + billPromo), subtotal);

  // Loyalty points spent on this bill work like a discount.
  let pointsRedeemed = 0;
  let pointsValue = 0;
  if (body.redeemPoints) {
    if (!settings?.loyaltyEnabled) throw new ApiError(400, "Loyalty points are switched off in Settings.");
    if (!customer) throw new ApiError(400, "Choose the customer whose points are being used.");
    if (body.redeemPoints < (settings.loyaltyMinRedeem ?? 0)) throw new ApiError(400, `At least ${settings.loyaltyMinRedeem} points are needed to use them.`);
    const worth = settings.loyaltyPointValue ?? 1;
    pointsRedeemed = Math.min(body.redeemPoints, worth > 0 ? Math.floor((subtotal - discount) / worth) : 0);
    pointsValue = round2(pointsRedeemed * worth);
    discount = round2(discount + pointsValue);
  }
  const afterDiscount = round2(subtotal - discount);
  const taxRate = settings?.taxEnabled ? settings.taxRate ?? 0 : 0;
  let tax = 0;
  let total = afterDiscount;
  if (taxRate > 0) {
    if (settings?.pricesIncludeTax ?? true) {
      tax = round2((afterDiscount * taxRate) / (100 + taxRate));
    } else {
      tax = round2((afterDiscount * taxRate) / 100);
      total = round2(afterDiscount + tax);
    }
  }
  const costTotal = round2(items.reduce((s, i) => s + i.qty * i.cost, 0));

  const { payments, change, paymentMethod } = settlePayments(body, total);
  const amountPaid = round2(payments.reduce((a, p) => a + p.amount, 0));
  const creditAmount = round2(Math.max(0, total - amountPaid));

  if (opts.installment && !customer) throw new ApiError(400, "Choose the customer who buys on installments.");
  // Staff limits set by the owner. An offline bill was already handed over, so it is recorded, but every
  // limit it crossed goes to the activity log for the owner to see.
  const crossed: string[] = [];
  const overLimit = (msg: string) => {
    if (!offline) throw new ApiError(400, msg);
    crossed.push(msg);
  };
  if (user.role !== "owner") {
    const limits = await User.findOne({ _id: user.id, tenant: tid }).select("maxDiscountPct allowUdhaar").lean();
    if (limits?.allowUdhaar === false && creditAmount > 0) overLimit("You are not allowed to give udhaar or installments. Ask the owner or manager.");
    if (limits?.maxDiscountPct !== undefined && limits.maxDiscountPct !== null) {
      const gross = round2(items.reduce((s, i) => s + i.total + i.discount, 0));
      const typed = round2(manualLineDiscount + Math.min(body.discount, subtotal));
      const pct = gross > 0 ? (typed / gross) * 100 : 0;
      if (pct > limits.maxDiscountPct + 0.01) overLimit(`Discount ${pct.toFixed(1)}% is more than your limit of ${limits.maxDiscountPct}%. Ask the owner or manager.`);
    }
  }
  if (creditAmount > 0 && !opts.installment) {
    if (!customer) throw new ApiError(400, "Amount received is less than the bill. Select a customer to add the rest to their khata (udhaar).");
    if (customer.creditLimit > 0 && customer.balance + creditAmount > customer.creditLimit && user.role !== "owner") {
      overLimit(`Credit limit crossed for ${customer.name}. Limit is Rs ${customer.creditLimit}. Ask the owner.`);
    }
  }

  // Take the points before saving, so the same points cannot be spent twice.
  if (pointsRedeemed > 0) {
    // Points never go below zero, offline or not.
    const took = await Party.updateOne({ _id: customer!._id, tenant: tid, points: { $gte: pointsRedeemed } }, { $inc: { points: -pointsRedeemed } });
    if (!took.modifiedCount) throw new ApiError(400, `${customer!.name} does not have ${pointsRedeemed} points.`);
  }
  const promoTotal = round2(applied.lines.reduce((a, l) => a + (l?.discount ?? 0), 0) + billPromo);
  const pointsEarnedNow = customer && settings?.loyaltyEnabled ? pointsEarned(amountPaid, settings.loyaltyEarnPer ?? 100) : 0;

  const invoiceNo = await nextNumber(tid, "sale", "INV");
  // Reserve the phones first (all or nothing), so the same phone can never be sold twice.
  const claims: string[] = [];
  const undoClaims = () => Promise.all(claims.map((op) => undoClaim(tid, op)));
  try {
    for (const it of items) {
      if (!("serials" in it) || !it.serials?.length) continue;
      const each = round2(it.total / it.qty);
      const { op } = await claimDevices({
        tid,
        ids: it.serials.map((x) => x.device),
        productId: it.product,
        branch: branch._id,
        to: "sold",
        sale: { invoiceNo, customerName: customer?.name, at: soldAt ?? new Date(), prices: new Map(it.serials.map((x) => [String(x.device), each])), warrantyMonths: it.warrantyMonths },
        event: { action: "Sold", refNo: invoiceNo, note: customer?.name ? `to ${customer.name}` : undefined },
        userName: user.name,
      });
      claims.push(op);
    }
  } catch (err) {
    await undoClaims();
    throw err;
  }
  let sale;
  try {
    sale = await Sale.create({
      tenant: tid,
      invoiceNo,
      branch: branch._id,
      branchName: branch.name,
      clientId: body.clientId,
      offline,
      ...(soldAt ? { createdAt: soldAt } : {}),
      items,
      subtotal,
      discount,
      tax,
      taxRate,
      total,
      costTotal,
      paymentMethod,
      payments,
      amountPaid,
      change,
      creditAmount,
      customer: customer?._id,
      customerName: customer?.name,
      cashier: user.id,
      cashierName: user.name,
      note: body.note,
      ...(opts.installment ? { installment: true } : {}),
      fbrStatus: settings?.fbrEnabled ? "pending" : "none",
      ...(applied.bill && billPromo > 0 ? { promo: { name: applied.bill.name, amount: billPromo } } : {}),
      ...(promoTotal > 0 ? { promoTotal } : {}),
      ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsValue } : {}),
      ...(pointsEarnedNow > 0 ? { pointsEarned: pointsEarnedNow } : {}),
    });
  } catch (err) {
    // Give the points and the phones back if the bill could not be saved.
    if (pointsRedeemed > 0) await Party.updateOne({ _id: customer!._id, tenant: tid }, { $inc: { points: pointsRedeemed } });
    await undoClaims();
    throw err;
  }
  for (const op of claims) await linkSale(tid, op, sale._id);
  if (customer && (pointsRedeemed > 0 || pointsEarnedNow > 0)) {
    await recordPoints(tid, customer._id, { redeemed: pointsRedeemed, earned: pointsEarnedNow, saleId: sale._id, invoiceNo, userId: user.id });
  }

  const batchSet: Record<string, unknown> = {};
  for (const [i, item] of items.entries()) {
    const moved = await moveStock({ tid, branch: branch._id, productId: item.product, qty: -item.qty, type: "sale", refNo: invoiceNo, userId: user.id, serialOk: "serials" in item && !!item.serials?.length });
    if (moved?.allocations.length) batchSet[`items.${i}.batches`] = moved.allocations.map((a) => ({ batch: a.batch, qty: a.qty, expiryDate: a.expiryDate }));
  }
  if (Object.keys(batchSet).length) await Sale.updateOne({ _id: sale._id, tenant: tid }, { $set: batchSet });
  if (customer && creditAmount > 0 && !opts.installment) {
    await postLedger({
      tid,
      partyId: customer._id,
      kind: "sale",
      amount: creditAmount,
      refType: "sale",
      refId: sale._id,
      refNo: invoiceNo,
      note: `Bill ${invoiceNo}`,
      userId: user.id,
    });
  }
  if (crossed.length) {
    await logActivity(
      { tid, user, branchId: branch._id },
      { action: "sale.offline-limit", summary: `${invoiceNo} (${total}) made offline above ${user.name}'s limits: ${crossed.join(" ")}`, refType: "sale", refId: sale._id, amount: total },
    );
  }
  // Only discounts typed by hand are worth recording (offers and points are automatic).
  const manualBill = round2(Math.min(body.discount, subtotal));
  if (priceChanges.length || manualBill > 0 || manualLineDiscount > 0) {
    await logActivity(
      { tid, user, branchId: branch._id },
      {
        action: priceChanges.length ? "sale.price" : "sale.discount",
        summary: `${invoiceNo} (${total}): ${[
          priceChanges.length && `price changed — ${priceChanges.join(", ")}`,
          manualBill > 0 && `bill discount Rs ${manualBill}`,
          manualLineDiscount > 0 && `item discounts Rs ${manualLineDiscount}`,
        ]
          .filter(Boolean)
          .join("; ")}`,
        refType: "sale",
        refId: sale._id,
        refNo: invoiceNo,
        amount: round2(manualBill + manualLineDiscount),
      },
    );
  }
  if (settings?.fbrEnabled) await syncSaleToFbr(tid, sale._id);
  return Sale.findOne({ _id: sale._id, tenant: tid }).lean();
}

type Tender = (typeof TENDER_METHODS)[number];
type PaymentLine = { method: Tender; amount: number; ref?: string };

/**
 * Works out what was paid by each method. Only cash can be more than the bill (the extra is given
 * back as change); whatever is not paid goes to the customer's udhaar.
 */
function settlePayments(body: SaleInput, total: number): { payments: PaymentLine[]; change: number; paymentMethod: (typeof PAYMENT_METHODS)[number] } {
  if (body.payments?.length) {
    const merged = new Map<Tender, PaymentLine>();
    for (const p of body.payments) {
      const amount = round2(p.amount);
      if (amount <= 0) continue;
      const row = merged.get(p.method);
      if (row) row.amount = round2(row.amount + amount);
      else merged.set(p.method, { method: p.method, amount, ...(p.ref ? { ref: p.ref } : {}) });
    }
    const nonCash = [...merged.values()].filter((p) => p.method !== "cash");
    const nonCashTotal = round2(nonCash.reduce((a, p) => a + p.amount, 0));
    if (nonCashTotal > total + 0.001) {
      throw new ApiError(400, "Card / JazzCash / Easypaisa / bank amounts are more than the bill. Only cash can be more (change is given back).");
    }
    const cashGiven = merged.get("cash")?.amount ?? 0;
    const cashApplied = round2(Math.min(cashGiven, total - nonCashTotal));
    const payments = [...nonCash, ...(cashApplied > 0 ? [{ method: "cash" as const, amount: cashApplied }] : [])];
    const main = [...payments].sort((a, b) => b.amount - a.amount)[0];
    return { payments, change: round2(cashGiven - cashApplied), paymentMethod: main?.method ?? "credit" };
  }

  if (!body.paymentMethod) throw new ApiError(400, "Choose how the customer is paying.");
  const method = body.paymentMethod;
  let given = body.amountPaid === undefined ? (method === "credit" ? 0 : total) : round2(body.amountPaid);
  // Card / wallet / bank payments are always for the exact amount.
  if (method !== "cash" && method !== "credit" && given === 0) given = total;
  const applied = round2(Math.min(given, total));
  // Money paid now on an udhaar bill is cash.
  const tender: Tender = method === "credit" ? "cash" : method;
  const payments = applied > 0 ? [{ method: tender, amount: applied, ...(body.paymentRef && tender !== "cash" ? { ref: body.paymentRef } : {}) }] : [];
  return { payments, change: round2(Math.max(0, given - total)), paymentMethod: applied === 0 && total > 0 ? "credit" : method };
}
