import { z } from "zod";
import { ApiError, dateRange, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { optionalId } from "@/lib/schemas";
import { batchExpiry } from "@/lib/batches";
import { findPack } from "@/lib/pricing";
import { moveStock, postLedger } from "@/lib/services";
import { addDevices, checkNewUnits, type DeviceUnit } from "@/lib/devices";
import { DEVICE_CONDITIONS, PTA_STATUS } from "@/lib/constants";
import { nextNumber, Party, Product, Purchase } from "@/models";

export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 30);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  return Purchase.find({ tenant: ctx.tid, createdAt: { $gte: from, $lte: to }, ...(branch ? { branch } : {}) }).sort({ createdAt: -1 }).limit(500).lean();
});

const UnitSchema = z.object({
  imei: z.string().trim().min(1, "Enter the IMEI").max(40),
  imei2: z.string().trim().max(40).optional(),
  color: z.string().trim().max(30).optional(),
  storage: z.string().trim().max(30).optional(),
  condition: z.enum(DEVICE_CONDITIONS).optional(),
  pta: z.enum(PTA_STATUS).optional(),
  price: z.coerce.number().min(0).optional(),
});

const Body = z.object({
  supplierId: optionalId,
  supplierInvoice: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i),
        qty: z.coerce.number().positive("Quantity must be more than zero"),
        /** Cost of one unit, or of one pack when `pack` is given. */
        cost: z.coerce.number().min(0),
        salePrice: z.coerce.number().min(0).optional(),
        /** Bought in a pack size of the product, e.g. "Carton"; qty is then the number of packs. */
        pack: z.string().trim().max(30).optional(),
        /** For products with "track expiry": this lot's expiry date (yyyy-mm-dd) and batch number. */
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date is not valid").optional().or(z.literal("").transform(() => undefined)),
        batchNo: z.string().trim().max(40).optional(),
        /** Phones (products with "track IMEI"): one entry per piece; qty must equal their number. */
        units: z.array(UnitSchema).max(500).optional(),
      }),
    )
    .min(1, "Add at least one item"),
  amountPaid: z.coerce.number().min(0).optional(),
  updatePrices: z.boolean().default(true),
  note: z.string().trim().optional(),
});

export const POST = handle(async (req) => {
  const { user, tid, branchId, branch } = await requireBranch(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const products = await Product.find({ tenant: tid, _id: { $in: body.items.map((i) => i.productId) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const items = body.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new ApiError(400, "One of the products no longer exists.");
    const pack = findPack(p, i.pack);
    if (i.pack && !pack) throw new ApiError(400, `${p.name} has no pack size "${i.pack}".`);
    if (p.trackSerial) {
      if (i.pack) throw new ApiError(400, `${p.name} is bought one piece at a time (by IMEI).`);
      if (!i.units?.length) throw new ApiError(400, `Enter the IMEI of every ${p.name}.`);
      if (i.units.length !== i.qty) throw new ApiError(400, `${p.name}: quantity is ${i.qty} but ${i.units.length} IMEI(s) are entered.`);
    } else if (i.units?.length) {
      throw new ApiError(400, `${p.name} is not tracked by IMEI.`);
    }
    if (pack) {
      return {
        product: p._id,
        name: p.name,
        unit: p.unit,
        qty: Math.round(i.qty * pack.size * 1000) / 1000,
        cost: Math.round((i.cost / pack.size) * 10000) / 10000,
        total: round2(i.qty * i.cost),
        salePrice: i.salePrice,
        pack: { name: pack.name, size: pack.size, count: i.qty, cost: i.cost },
        expiryDate: i.expiryDate,
        batchNo: i.batchNo,
      };
    }
    return { product: p._id, name: p.name, unit: p.unit, qty: i.qty, cost: i.cost, total: round2(i.qty * i.cost), salePrice: i.salePrice, expiryDate: i.expiryDate, batchNo: i.batchNo, units: i.units as DeviceUnit[] | undefined };
  });
  // Check every IMEI before saving anything.
  const allUnits = items.flatMap((i) => ("units" in i && i.units) || []);
  if (allUnits.length) await checkNewUnits(tid, allUnits);
  const total = round2(items.reduce((s, i) => s + i.total, 0));

  let supplier = null;
  if (body.supplierId) {
    supplier = await Party.findOne({ _id: body.supplierId, tenant: tid, type: "supplier" }).lean();
    if (!supplier) throw new ApiError(400, "Supplier not found.");
  }
  // Without a supplier there is no khata to put the balance in, so treat it as fully paid.
  const amountPaid = supplier ? Math.min(round2(body.amountPaid ?? total), total) : total;

  const purchaseNo = await nextNumber(tid, "purchase", "PUR");
  const purchase = await Purchase.create({
    tenant: tid,
    purchaseNo,
    branch: branchId,
    branchName: branch.name,
    supplier: supplier?._id,
    supplierName: supplier?.name,
    supplierInvoice: body.supplierInvoice,
    items: items.map((i) => ({
      product: i.product,
      name: i.name,
      unit: i.unit,
      qty: i.qty,
      cost: i.cost,
      total: i.total,
      ...("pack" in i ? { pack: i.pack } : {}),
      ...(i.expiryDate ? { expiryDate: new Date(`${i.expiryDate}T23:59:59`) } : {}),
      ...(i.batchNo ? { batchNo: i.batchNo } : {}),
    })),
    total,
    amountPaid,
    note: body.note,
    user: user.id,
  });

  for (const [n, item] of items.entries()) {
    const p = byId.get(String(item.product));
    if ("units" in item && item.units?.length) {
      const added = await addDevices({
        tid,
        branch: branchId,
        product: { _id: item.product, name: item.name },
        units: item.units,
        cost: item.cost,
        source: { type: "purchase", id: purchase._id, refNo: purchaseNo, name: supplier?.name },
        event: { action: "Bought", refNo: purchaseNo, note: supplier?.name ? `from ${supplier.name}` : undefined },
        userName: user.name,
      });
      await Purchase.updateOne({ _id: purchase._id, tenant: tid }, { $set: { [`items.${n}.serials`]: added.map((d) => ({ device: d._id, imei: d.imei })) } });
      await moveStock({ tid, branch: branchId, productId: item.product, qty: item.qty, type: "purchase", refNo: purchaseNo, userId: user.id, serialOk: true });
    } else await moveStock({
      tid,
      branch: branchId,
      productId: item.product,
      qty: item.qty,
      type: "purchase",
      refNo: purchaseNo,
      userId: user.id,
      batch: {
        incoming: [{ expiryDate: batchExpiry(item.expiryDate ? new Date(`${item.expiryDate}T23:59:59`) : null, p?.shelfLifeDays), batchNo: item.batchNo, cost: item.cost }],
        source: { type: "purchase", id: purchase._id, refNo: purchaseNo },
      },
    });
    if (body.updatePrices) {
      const set: Record<string, number> = { costPrice: Math.round(item.cost * 100) / 100 };
      if (item.salePrice !== undefined && item.salePrice > 0) set.salePrice = item.salePrice;
      await Product.updateOne({ _id: item.product, tenant: tid }, { $set: set });
    }
  }
  if (supplier) {
    await postLedger({ tid, partyId: supplier._id, kind: "purchase", amount: total, refType: "purchase", refId: purchase._id, refNo: purchaseNo, note: `Purchase ${purchaseNo}`, userId: user.id, branch: branchId });
    if (amountPaid > 0) {
      await postLedger({ tid, partyId: supplier._id, kind: "payment", amount: -amountPaid, method: "cash", refType: "purchase", refId: purchase._id, refNo: purchaseNo, note: `Paid for ${purchaseNo}`, userId: user.id, branch: branchId });
    }
  }
  await logActivity(
    { tid, user, branchId },
    { action: "purchase.create", summary: `${purchaseNo}: Rs ${total} from ${supplier?.name ?? "no supplier"}, paid Rs ${amountPaid}`, refType: "purchase", refId: purchase._id, refNo: purchaseNo, amount: total },
  );
  return purchase.toObject();
});
