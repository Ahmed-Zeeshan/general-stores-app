import { z } from "zod";
import { ApiError, escapeRegex, handle } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { DEVICE_CONDITIONS, PTA_STATUS } from "@/lib/constants";
import { addDevices, cleanImei } from "@/lib/devices";
import { moveStock } from "@/lib/services";
import { Device, Product } from "@/models";

/**
 * Phones (pieces with IMEI). ?status=in_stock|sold|returned|removed|all (default in stock),
 * ?product=…, ?q= IMEI / model / colour, ?branch=all for every branch (owner/manager).
 */
export const GET = handle(async (req) => {
  const ctx = await requireBranch();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "in_stock";
  const query: Record<string, unknown> = { tenant: ctx.tid };
  if (status !== "all") query.status = status;
  const product = url.searchParams.get("product");
  if (product) query.product = product;
  // In-stock phones are listed for the branch they are at; sold ones for the shop (or one branch).
  const branch = ctx.user.role === "cashier" ? ctx.branchId : reportBranchFilter(ctx, url.searchParams.get("branch") ?? (status === "in_stock" ? null : "all"));
  if (branch) query.branch = branch;
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const code = cleanImei(q);
    query.$or = [{ imei: code }, { imei2: code }, { imei: new RegExp(`${escapeRegex(code)}$`) }, { productName: rx }, { color: rx }, { storage: rx }, { "sale.customerName": rx }, { "source.name": rx }];
  }
  return Device.find(query).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 1000, 5000))).select(ctx.user.role === "cashier" ? "-history -cost" : "-history").lean();
});

const Unit = z.object({
  imei: z.string().trim().min(1, "Enter the IMEI").max(40),
  imei2: z.string().trim().max(40).optional(),
  color: z.string().trim().max(30).optional(),
  storage: z.string().trim().max(30).optional(),
  condition: z.enum(DEVICE_CONDITIONS).optional(),
  pta: z.enum(PTA_STATUS).optional(),
  price: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(200).optional(),
});
const Body = z.object({
  productId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose the phone model"),
  /** What one phone cost the shop. */
  cost: z.coerce.number().min(0),
  units: z.array(Unit).min(1, "Enter at least one IMEI").max(500),
  note: z.string().trim().max(200).optional(),
});

/** Adds phones already in the shop (opening stock, or found in a stock check) with their IMEIs. */
export const POST = handle(async (req) => {
  const { user, tid, branchId } = await requireBranch(["owner", "manager"]);
  const body = Body.parse(await req.json());
  const product = await Product.findOne({ _id: body.productId, tenant: tid, active: true }).lean();
  if (!product) throw new ApiError(404, "Phone model not found.");
  if (!product.trackSerial) throw new ApiError(400, `${product.name} is not tracked by IMEI. Switch on "Track IMEI" for it in Products first.`);
  const added = await addDevices({
    tid,
    branch: branchId,
    product,
    units: body.units,
    cost: body.cost,
    source: { type: "opening" },
    event: { action: "Added to stock", note: body.note },
    userName: user.name,
  });
  await moveStock({ tid, branch: branchId, productId: product._id, qty: added.length, type: "opening", note: body.note || "Phones added with IMEI", userId: user.id, serialOk: true });
  await logActivity(
    { tid, user, branchId },
    { action: "device.add", summary: `Added ${added.length} × ${product.name}: ${added.map((d) => d.imei).join(", ")}`, refType: "product", refId: product._id, amount: body.cost * added.length },
  );
  return added.map((d) => d.toObject());
});
