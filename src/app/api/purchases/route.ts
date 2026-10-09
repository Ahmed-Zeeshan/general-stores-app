import { z } from "zod";
import { ApiError, dateRange, handle, requireUser } from "@/lib/api";
import { round2 } from "@/lib/money";
import { optionalId } from "@/lib/schemas";
import { moveStock, postLedger } from "@/lib/services";
import { nextNumber, Party, Product, Purchase } from "@/models";

export const GET = handle(async (req) => {
  await requireUser(["owner", "manager"]);
  const { from, to } = dateRange(new URL(req.url), 30);
  return Purchase.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).limit(500).lean();
});

const Body = z.object({
  supplierId: optionalId,
  supplierInvoice: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i),
        qty: z.coerce.number().positive("Quantity must be more than zero"),
        cost: z.coerce.number().min(0),
        salePrice: z.coerce.number().min(0).optional(),
      }),
    )
    .min(1, "Add at least one item"),
  amountPaid: z.coerce.number().min(0).optional(),
  updatePrices: z.boolean().default(true),
  note: z.string().trim().optional(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const products = await Product.find({ _id: { $in: body.items.map((i) => i.productId) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const items = body.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new ApiError(400, "One of the products no longer exists.");
    return { product: p._id, name: p.name, unit: p.unit, qty: i.qty, cost: i.cost, total: round2(i.qty * i.cost), salePrice: i.salePrice };
  });
  const total = round2(items.reduce((s, i) => s + i.total, 0));

  let supplier = null;
  if (body.supplierId) {
    supplier = await Party.findOne({ _id: body.supplierId, type: "supplier" }).lean();
    if (!supplier) throw new ApiError(400, "Supplier not found.");
  }
  // Without a supplier there is no khata to put the balance in, so treat it as fully paid.
  const amountPaid = supplier ? Math.min(round2(body.amountPaid ?? total), total) : total;

  const purchaseNo = await nextNumber("purchase", "PUR");
  const purchase = await Purchase.create({
    purchaseNo,
    supplier: supplier?._id,
    supplierName: supplier?.name,
    supplierInvoice: body.supplierInvoice,
    items: items.map((i) => ({ product: i.product, name: i.name, unit: i.unit, qty: i.qty, cost: i.cost, total: i.total })),
    total,
    amountPaid,
    note: body.note,
    user: user.id,
  });

  for (const item of items) {
    await moveStock({ productId: item.product, qty: item.qty, type: "purchase", refNo: purchaseNo, userId: user.id });
    if (body.updatePrices) {
      const set: Record<string, number> = { costPrice: item.cost };
      if (item.salePrice !== undefined && item.salePrice > 0) set.salePrice = item.salePrice;
      await Product.updateOne({ _id: item.product }, { $set: set });
    }
  }
  if (supplier) {
    await postLedger({ partyId: supplier._id, kind: "purchase", amount: total, refType: "purchase", refId: purchase._id, refNo: purchaseNo, note: `Purchase ${purchaseNo}`, userId: user.id });
    if (amountPaid > 0) {
      await postLedger({ partyId: supplier._id, kind: "payment", amount: -amountPaid, method: "cash", refType: "purchase", refId: purchase._id, refNo: purchaseNo, note: `Paid for ${purchaseNo}`, userId: user.id });
    }
  }
  return purchase.toObject();
});
