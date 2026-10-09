import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { PAYMENT_METHODS } from "@/lib/constants";

export { PAYMENT_METHODS };

const SaleItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    unit: { type: String },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const SaleSchema = new Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    items: { type: [SaleItemSchema], required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    total: { type: Number, required: true },
    costTotal: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    amountPaid: { type: Number, default: 0 },
    change: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 },
    customer: { type: Schema.Types.ObjectId, ref: "Party" },
    customerName: { type: String },
    cashier: { type: Schema.Types.ObjectId, ref: "User" },
    cashierName: { type: String },
    status: { type: String, enum: ["completed", "returned"], default: "completed" },
    returnedAt: { type: Date },
    note: { type: String },
  },
  { timestamps: true },
);

SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ status: 1, createdAt: -1 });

export type SaleDoc = InferSchemaType<typeof SaleSchema>;
export const Sale: Model<SaleDoc> = models.Sale || model<SaleDoc>("Sale", SaleSchema);
