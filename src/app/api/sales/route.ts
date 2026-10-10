import { z } from "zod";
import { ApiError, dateRange, escapeRegex, handle } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { syncSaleToFbr } from "@/lib/fbr";
import { round2 } from "@/lib/money";
import { optionalId } from "@/lib/schemas";
import { moveStock, postLedger } from "@/lib/services";
import { nextNumber, PAYMENT_METHODS, Party, Product, Sale, Tenant } from "@/models";

export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 0);
  const q = url.searchParams.get("q")?.trim();
  const query: Record<string, unknown> = { tenant: ctx.tid, createdAt: { $gte: from, $lte: to } };
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  if (branch) query.branch = branch;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ invoiceNo: rx }, { customerName: rx }];
  }
  const method = url.searchParams.get("method");
  if (method) query.paymentMethod = method;
  const fbr = url.searchParams.get("fbr");
  if (fbr) query.fbrStatus = fbr;
  return Sale.find(query).sort({ createdAt: -1 }).limit(1000).lean();
});

const Body = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i),
        qty: z.coerce.number().positive("Quantity must be more than zero"),
        price: z.coerce.number().min(0).optional(),
        discount: z.coerce.number().min(0).default(0),
      }),
    )
    .min(1, "Add at least one item"),
  discount: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** Omitted = paid in full (or nothing paid for udhaar). */
  amountPaid: z.coerce.number().min(0).optional(),
  customerId: optionalId,
  note: z.string().trim().optional(),
  // Offline bills (made while the server was unreachable) are sent later with these:
  clientId: z.string().trim().min(8).max(64).optional(),
  soldAt: z.string().datetime().optional(),
  branchId: optionalId,
});

export const POST = handle(async (req) => {
  const ctx = await requireBranch();
  const { user, tid } = ctx;
  const body = Body.parse(await req.json());

  // Re-sending the same offline bill returns the bill already saved instead of a duplicate.
  if (body.clientId) {
    const existing = await Sale.findOne({ tenant: tid, clientId: body.clientId }).lean();
    if (existing) return existing;
  }
  const offline = !!body.clientId && !!body.soldAt;
  let soldAt: Date | undefined;
  if (offline) {
    soldAt = new Date(body.soldAt!);
    const age = Date.now() - soldAt.getTime();
    if (age > 30 * 864e5 || age < -10 * 60_000) throw new ApiError(400, "Offline bill date is not valid. Check this device's date and time.");
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

  const items = body.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new ApiError(400, "One of the products no longer exists. Please refresh.");
    // Cashiers always sell at the saved price; owner/manager may change the price at the counter.
    const price = user.role === "cashier" || i.price === undefined ? p.salePrice : i.price;
    const gross = round2(i.qty * price);
    const discount = Math.min(round2(i.discount), gross);
    return {
      product: p._id,
      name: p.name,
      unit: p.unit,
      qty: i.qty,
      price,
      cost: p.costPrice ?? 0,
      discount,
      total: round2(gross - discount),
    };
  });

  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discount = Math.min(round2(body.discount), subtotal);
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

  let amountPaid = body.amountPaid === undefined ? (body.paymentMethod === "credit" ? 0 : total) : round2(body.amountPaid);
  // Card / wallet / bank payments are always for the exact amount.
  if (body.paymentMethod !== "cash" && body.paymentMethod !== "credit" && amountPaid === 0) amountPaid = total;
  const change = round2(Math.max(0, amountPaid - total));
  const creditAmount = round2(Math.max(0, total - amountPaid));

  let customer = null;
  if (body.customerId) {
    customer = await Party.findOne({ _id: body.customerId, tenant: tid, type: "customer" }).lean();
    if (!customer) throw new ApiError(400, "Customer not found.");
  }
  if (creditAmount > 0) {
    if (!customer) throw new ApiError(400, "Amount received is less than the bill. Select a customer to add the rest to their khata (udhaar).");
    // An offline bill has already been handed over, so it is recorded even above the limit.
    if (!offline && customer.creditLimit > 0 && customer.balance + creditAmount > customer.creditLimit && user.role !== "owner") {
      throw new ApiError(400, `Credit limit crossed for ${customer.name}. Limit is Rs ${customer.creditLimit}. Ask the owner.`);
    }
  }

  const invoiceNo = await nextNumber(tid, "sale", "INV");
  const sale = await Sale.create({
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
    paymentMethod: creditAmount > 0 && amountPaid === 0 ? "credit" : body.paymentMethod,
    amountPaid: Math.min(amountPaid, total),
    change,
    creditAmount,
    customer: customer?._id,
    customerName: customer?.name,
    cashier: user.id,
    cashierName: user.name,
    note: body.note,
    fbrStatus: settings?.fbrEnabled ? "pending" : "none",
  });

  for (const item of items) {
    await moveStock({ tid, branch: branch._id, productId: item.product, qty: -item.qty, type: "sale", refNo: invoiceNo, userId: user.id });
  }
  if (customer && creditAmount > 0) {
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
  if (settings?.fbrEnabled) await syncSaleToFbr(tid, sale._id);
  return Sale.findOne({ _id: sale._id, tenant: tid }).lean();
});
