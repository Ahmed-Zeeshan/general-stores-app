import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { assertOpen, loadRepair, repairTotals, saveRepair } from "@/lib/repairs";
import { moveStock } from "@/lib/services";
import { Product } from "@/models";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  productId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose the part"),
  qty: z.coerce.number().positive("Quantity must be more than zero").default(1),
  /** Charged to the customer for one; default = the part's sale price. */
  price: z.coerce.number().min(0).optional(),
});

/** Uses a spare part from stock on this job. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const { user, tid } = await requireBranch();
  const { id } = await params;
  const body = Body.parse(await req.json());
  const r = await loadRepair(tid, id);
  assertOpen(r);
  const p = await Product.findOne({ _id: body.productId, tenant: tid, active: true }).lean();
  if (!p) throw new ApiError(404, "Part not found.");
  if (p.trackSerial) throw new ApiError(400, `${p.name} is a phone tracked by IMEI, not a spare part.`);
  const have = (await branchStock(tid, r.branch, [p._id])).get(String(p._id)) ?? 0;
  if (have + 0.0005 < body.qty) throw new ApiError(400, `Only ${have} of ${p.name} in stock.`);
  if (body.price !== undefined && body.price !== p.salePrice && user.role === "cashier") throw new ApiError(403, "Only the owner or manager can change a part's price.");
  const part = { product: p._id, name: p.name, qty: body.qty, cost: p.costPrice ?? 0, price: body.price ?? p.salePrice, at: new Date(), userName: user.name };
  const saved = await saveRepair(tid, r, { $push: { parts: part } }, { note: `Part used: ${p.name} ×${body.qty}`, userName: user.name });
  await moveStock({ tid, branch: r.branch, productId: p._id, qty: -body.qty, type: "repair", refNo: r.jobNo, note: `Used in repair ${r.jobNo}`, userId: user.id });
  return { ...saved, ...repairTotals(saved) };
});
