import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { UNITS } from "@/lib/constants";

export { UNITS };

/** A bigger unit the product is also sold or bought in, e.g. Carton = 24 pieces. */
const PackSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0.001 },
    /** Selling price of the whole pack; empty = size × unit price. */
    price: { type: Number, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    barcode: { type: String, trim: true },
  },
  { _id: false },
);

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
    /** Price per unit for wholesale customers; empty = same as sale price. */
    wholesalePrice: { type: Number, min: 0 },
    packs: { type: [PackSchema], default: undefined },
    stock: { type: Number, default: 0 },
    lowStockAlert: { type: Number, default: 5, min: 0 },
    expiryDate: { type: Date },
    /** Keep stock in batches with their own expiry dates; sell the earliest expiry first. */
    trackExpiry: { type: Boolean, default: false },
    /** Days a fresh batch lasts (bakery items); fills the expiry date when none is entered. */
    shelfLifeDays: { type: Number, min: 0 },
    /** FBR Pakistan Customs Tariff code; falls back to the shop default. */
    pctCode: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ProductSchema.plugin(tenantScoped);

ProductSchema.index({ tenant: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: "string", $gt: "" } } });
ProductSchema.index({ tenant: 1, active: 1, name: 1 });
ProductSchema.index({ tenant: 1, "packs.barcode": 1 }, { sparse: true });

export type ProductDoc = InferSchemaType<typeof ProductSchema>;
export const Product: Model<ProductDoc> = models.Product || model<ProductDoc>("Product", ProductSchema);
