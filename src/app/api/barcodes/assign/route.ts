import { z } from "zod";
import { handle, requireTenant } from "@/lib/api";
import { nextBarcode } from "@/lib/barcode-server";
import { Product } from "@/models";

const Body = z.object({
  /** Specific products; omitted = every active product that has no barcode. */
  productIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(5000).optional(),
});

/** Gives a new in-store barcode to products that do not have one. Products with a barcode are never changed. */
export const POST = handle(async (req) => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const { productIds } = Body.parse(await req.json().catch(() => ({})));
  const filter: Record<string, unknown> = {
    tenant: tid,
    active: true,
    $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: "" }],
  };
  if (productIds) filter._id = { $in: productIds };
  const products = await Product.find(filter).select("_id").limit(5000).lean();
  const assigned: { _id: string; barcode: string }[] = [];
  for (const p of products) {
    const barcode = await nextBarcode(tid);
    const r = await Product.updateOne({ _id: p._id, tenant: tid, $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: "" }] }, { barcode });
    if (r.modifiedCount) assigned.push({ _id: String(p._id), barcode });
  }
  return { assigned: assigned.length, products: assigned };
});
