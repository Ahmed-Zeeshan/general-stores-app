import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PurchaseItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    unit: { type: String },
    qty: { type: Number, required: true },
    cost: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const PurchaseSchema = new Schema(
  {
    purchaseNo: { type: String, required: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Party" },
    supplierName: { type: String },
    supplierInvoice: { type: String, trim: true },
    items: { type: [PurchaseItemSchema], required: true },
    total: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    note: { type: String },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PurchaseSchema.plugin(tenantScoped);

PurchaseSchema.index({ tenant: 1, purchaseNo: 1 }, { unique: true });
PurchaseSchema.index({ tenant: 1, createdAt: -1 });

export type PurchaseDoc = InferSchemaType<typeof PurchaseSchema>;
export const Purchase: Model<PurchaseDoc> =
  models.Purchase || model<PurchaseDoc>("Purchase", PurchaseSchema);
