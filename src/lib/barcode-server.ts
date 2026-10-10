import type { Types } from "mongoose";
import { inStoreEan13 } from "./barcode";
import { Counter, Product } from "@/models";

/** Next unused in-store barcode for this shop. */
export async function nextBarcode(tid: Types.ObjectId) {
  for (let i = 0; i < 1000; i++) {
    const c = await Counter.findOneAndUpdate({ _id: `${String(tid)}:barcode` }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    const code = inStoreEan13(c!.seq);
    if (!(await Product.exists({ tenant: tid, barcode: code }))) return code;
  }
  throw new Error("Could not find a free barcode");
}
