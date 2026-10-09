import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { UNITS } from "@/lib/constants";

export { UNITS };

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameUrdu: { type: String, trim: true },
    barcode: { type: String, trim: true },
    sku: { type: String, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category" },
    unit: { type: String, enum: UNITS, default: "pcs" },
    costPrice: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0 },
    lowStockAlert: { type: Number, default: 5, min: 0 },
    expiryDate: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ProductSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: "string", $gt: "" } } });
ProductSchema.index({ name: "text", nameUrdu: "text", sku: "text" });
ProductSchema.index({ active: 1, name: 1 });

export type ProductDoc = InferSchemaType<typeof ProductSchema>;
export const Product: Model<ProductDoc> = models.Product || model<ProductDoc>("Product", ProductSchema);
