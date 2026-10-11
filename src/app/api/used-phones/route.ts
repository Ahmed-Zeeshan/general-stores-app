import { z } from "zod";
import { ApiError, dateRange, escapeRegex, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { PTA_STATUS } from "@/lib/constants";
import { addDevices, checkNewUnits } from "@/lib/devices";
import { cleanImei } from "@/lib/imei";
import { cnicOrNull } from "@/lib/cnic";
import { moveStock, postLedger } from "@/lib/services";
import { round2 } from "@/lib/money";
import { optionalId } from "@/lib/schemas";
import { Category, Device, nextNumber, Party, Product, UsedPurchase } from "@/models";

/** Used phones bought from customers (?from&to dates, ?q name / CNIC / IMEI / phone number). */
export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 89);
  const query: Record<string, unknown> = { tenant: ctx.tid, createdAt: { $gte: from, $lte: to } };
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  if (branch) query.branch = branch;
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const digits = q.replace(/\D/g, "");
    query.$or = [{ buyNo: rx }, { "seller.name": rx }, { "seller.phone": rx }, { productName: rx }, { imei: cleanImei(q) }, { imei2: cleanImei(q) }, ...(digits.length >= 5 ? [{ "seller.cnic": new RegExp(digits.replace(/(\d)/g, "$1-?")) }] : [])];
  }
  return UsedPurchase.find(query).sort({ createdAt: -1 }).limit(500).select("-photos").lean();
});

function formatCnic(raw: string) {
  const c = cnicOrNull(raw);
  if (!c) throw new ApiError(400, "CNIC must have 13 digits (e.g. 35202-1234567-1).");
  return c;
}

const MAX_PHOTO = 450_000;
const Body = z.object({
  seller: z.object({
    name: z.string().trim().min(3, "Write the seller's full name").max(80),
    cnic: z.string().trim().min(1, "Enter the seller's CNIC"),
    phone: z.string().trim().regex(/^[0-9+\-\s]{10,16}$/, "Enter the seller's mobile number"),
    address: z.string().trim().max(200).optional(),
    partyId: optionalId,
  }),
  photos: z.array(z.string().startsWith("data:image/").max(MAX_PHOTO, "A photo is too large")).max(3).optional(),
  /** The phone model (product tracked by IMEI) — or a new model to create. */
  productId: optionalId,
  newModel: z.object({ name: z.string().trim().min(2).max(80), salePrice: z.coerce.number().min(0) }).optional(),
  imei: z.string().trim().min(4).max(40),
  imei2: z.string().trim().max(40).optional(),
  color: z.string().trim().max(30).optional(),
  storage: z.string().trim().max(30).optional(),
  pta: z.enum(PTA_STATUS).default("unknown"),
  condition: z.enum(["used", "refurbished"]).default("used"),
  checks: z.record(z.string().max(40), z.boolean()).optional(),
  batteryHealth: z.coerce.number().int().min(0).max(100).optional(),
  accessories: z.array(z.string().trim().max(30)).max(10).optional(),
  notes: z.string().trim().max(300).optional(),
  price: z.coerce.number().positive("Enter the price paid"),
  askingPrice: z.coerce.number().min(0).optional(),
  method: z.enum(["cash", "jazzcash", "easypaisa", "bank", "khata"]).default("cash"),
  paymentRef: z.string().trim().max(40).optional(),
  /** The seller's declaration was read to / signed by them. */
  declaration: z.literal(true, { errorMap: () => ({ message: "The seller must accept the declaration (the phone is theirs)." }) }),
});

/** Buys a used phone from a customer: it goes into stock with its IMEI; the seller's details are kept. */
export const POST = handle(async (req) => {
  const { user, tid, branchId, branch } = await requireBranch(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const cnic = formatCnic(body.seller.cnic);
  const imei = cleanImei(body.imei);
  const imei2 = body.imei2 ? cleanImei(body.imei2) : undefined;
  await checkNewUnits(tid, [{ imei, ...(imei2 ? { imei2 } : {}) }]);

  let party = null;
  if (body.seller.partyId) {
    party = await Party.findOne({ _id: body.seller.partyId, tenant: tid, type: "customer" }).lean();
    if (!party) throw new ApiError(400, "Customer not found.");
  }
  if (body.method === "khata" && !party) throw new ApiError(400, "Choose the customer whose khata gets the money (trade-in).");

  let product;
  if (body.productId) {
    product = await Product.findOne({ _id: body.productId, tenant: tid, active: true }).lean();
    if (!product) throw new ApiError(404, "Phone model not found.");
    if (!product.trackSerial) throw new ApiError(400, `${product.name} is not tracked by IMEI.`);
  } else if (body.newModel) {
    const cat = await Category.findOne({ tenant: tid, name: "Used Phones" }).lean();
    product = (
      await Product.create({ tenant: tid, name: body.newModel.name, unit: "pcs", costPrice: body.price, salePrice: body.newModel.salePrice || body.askingPrice || body.price, lowStockAlert: 0, trackSerial: true, category: cat?._id, stock: 0 })
    ).toObject();
  } else throw new ApiError(400, "Choose the phone model.");

  const buyNo = await nextNumber(tid, "usedBuy", "BUY");
  const doc = await UsedPurchase.create({
    tenant: tid,
    buyNo,
    branch: branchId,
    branchName: branch.name,
    seller: { name: body.seller.name, cnic, phone: body.seller.phone, address: body.seller.address, party: party?._id },
    photos: body.photos?.length ? body.photos : undefined,
    product: product._id,
    productName: product.name,
    imei,
    imei2,
    color: body.color,
    storage: body.storage,
    pta: body.pta,
    checks: body.checks,
    batteryHealth: body.batteryHealth,
    accessories: body.accessories,
    notes: body.notes,
    price: round2(body.price),
    askingPrice: body.askingPrice || undefined,
    method: body.method,
    paymentRef: body.paymentRef,
    user: user.id,
    userName: user.name,
  });
  try {
    const [device] = await addDevices({
      tid,
      branch: branchId,
      product,
      units: [{ imei, imei2, color: body.color, storage: body.storage, condition: body.condition, pta: body.pta, price: body.askingPrice || undefined, notes: body.notes }],
      cost: body.price,
      source: { type: "used_buy", id: doc._id, refNo: buyNo, name: body.seller.name },
      event: { action: "Bought used", refNo: buyNo, note: `from ${body.seller.name} (CNIC ${cnic})` },
      userName: user.name,
    });
    await UsedPurchase.updateOne({ _id: doc._id, tenant: tid }, { $set: { device: device._id } });
  } catch (err) {
    await UsedPurchase.deleteOne({ _id: doc._id, tenant: tid });
    throw err;
  }
  await moveStock({ tid, branch: branchId, productId: product._id, qty: 1, type: "used_buy", refNo: buyNo, note: `Used phone from ${body.seller.name}`, userId: user.id, serialOk: true });
  if (body.method === "khata" && party) {
    // Trade-in: the shop owes the customer this amount (it reduces their udhaar or becomes advance).
    await postLedger({ tid, partyId: party._id, kind: "adjustment", amount: -round2(body.price), refType: "used_buy", refId: doc._id, refNo: buyNo, note: `Used ${product.name} bought (IMEI ${imei})`, userId: user.id, branch: branchId });
  }
  await logActivity(
    { tid, user, branchId },
    { action: "used.buy", summary: `${buyNo}: bought used ${product.name} (IMEI ${imei}) from ${body.seller.name}, CNIC ${cnic}, for Rs ${body.price} (${body.method})`, refType: "used_buy", refId: doc._id, refNo: buyNo, amount: body.price },
  );
  // Earlier records of this IMEI (e.g. sold by this shop before) for the person at the counter.
  const earlier = await Device.find({ tenant: tid, $or: [{ imei }, { imei2: imei }], status: { $ne: "in_stock" } }).select("productName status sale source createdAt").lean();
  return { ...(await UsedPurchase.findOne({ _id: doc._id, tenant: tid }).select("-photos").lean()), earlier };
});
