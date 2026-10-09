import { z } from "zod";
import { ApiError, dateRange, escapeRegex, handle, requireUser } from "@/lib/api";
import { round2 } from "@/lib/money";
import { optionalId } from "@/lib/schemas";
import { moveStock, postLedger } from "@/lib/services";
import { nextNumber, PAYMENT_METHODS, Party, Product, Sale, Settings } from "@/models";

export const GET = handle(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 0);
  const q = url.searchParams.get("q")?.trim();
  const query: Record<string, unknown> = { createdAt: { $gte: from, $lte: to } };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = [{ invoiceNo: rx }, { customerName: rx }];
  }
  const method = url.searchParams.get("method");
  if (method) query.paymentMethod = method;
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
  amountPaid: z.coerce.number().min(0).default(0),
  customerId: optionalId,
  note: z.string().trim().optional(),
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  const settings = await Settings.findOne({ key: "shop" }).lean();

  const products = await Product.find({ _id: { $in: body.items.map((i) => i.productId) } }).lean();
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

  let amountPaid = round2(body.amountPaid);
  if (body.paymentMethod !== "cash" && body.paymentMethod !== "credit" && amountPaid === 0) amountPaid = total;
  const change = round2(Math.max(0, amountPaid - total));
  const creditAmount = round2(Math.max(0, total - amountPaid));

  let customer = null;
  if (body.customerId) {
    customer = await Party.findOne({ _id: body.customerId, type: "customer" }).lean();
    if (!customer) throw new ApiError(400, "Customer not found.");
  }
  if (creditAmount > 0) {
    if (!customer) throw new ApiError(400, "Amount received is less than the bill. Select a customer to add the rest to their khata (udhaar).");
    if (customer.creditLimit > 0 && customer.balance + creditAmount > customer.creditLimit && user.role !== "owner") {
      throw new ApiError(400, `Credit limit crossed for ${customer.name}. Limit is Rs ${customer.creditLimit}. Ask the owner.`);
    }
  }

  const invoiceNo = await nextNumber("sale", "INV");
  const sale = await Sale.create({
    invoiceNo,
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
  });

  for (const item of items) {
    await moveStock({ productId: item.product, qty: -item.qty, type: "sale", refNo: invoiceNo, userId: user.id });
  }
  if (customer && creditAmount > 0) {
    await postLedger({
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
  return sale.toObject();
});
