import type { Types } from "mongoose";
import { ApiError } from "./api";
import { inStoreEan13 } from "./barcode";
import { Counter, Product } from "@/models";

/** Next unused in-store barcode for this shop. */
export async function nextBarcode(tid: Types.ObjectId) {
  for (let i = 0; i < 1000; i++) {
    const c = await Counter.findOneAndUpdate({ _id: `${String(tid)}:barcode` }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    const code = inStoreEan13(c!.seq);
    if (!(await Product.exists({ tenant: tid, $or: [{ barcode: code }, { "packs.barcode": code }] }))) return code;
  }
  throw new Error("Could not find a free barcode");
}

/** Throws 409 if any of these barcodes is already used by another product or pack. */
export async function assertBarcodesFree(tid: Types.ObjectId, product: { barcode?: string | null; packs?: { barcode?: string | null }[] | null }, excludeId?: string) {
  const codes = [product.barcode, ...(product.packs ?? []).map((p) => p.barcode)].filter((c): c is string => !!c);
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) throw new ApiError(409, `Barcode ${c} is used twice on this product.`);
    seen.add(c);
  }
  if (!codes.length) return;
  const clash = await Product.findOne({
    tenant: tid,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: [{ barcode: { $in: codes } }, { "packs.barcode": { $in: codes } }],
  })
    .select("name barcode packs")
    .lean();
  if (clash) {
    const code = codes.find((c) => clash.barcode === c || clash.packs?.some((p) => p.barcode === c));
    throw new ApiError(409, `Barcode ${code} is already used by another product (${clash.name}).`);
  }
}
