import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Goods sent back to a supplier (damaged, expired, wrong items) from one purchase. */
const PurchaseReturnSchema = new Schema(
  {
    returnNo: { type: String, required: true },
    purchase: { type: Schema.Types.ObjectId, ref: "Purchase", required: true },
    purchaseNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    branchName: { type: String },
    supplier: { type: Schema.Types.ObjectId, ref: "Party" },
    supplierName: { type: String },
    items: {
      type: [
        {
          index: Number,
          product: { type: Schema.Types.ObjectId, ref: "Product" },
          name: String,
          unit: String,
          qty: Number,
          cost: Number,
          total: Number,
          _id: false,
        },
      ],
      required: true,
    },
    total: { type: Number, required: true },
    /** khata = taken off what we owe the supplier; cash = supplier gave the money back. */
    settlement: { type: String, enum: ["khata", "cash"], required: true },
    reason: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);

PurchaseReturnSchema.plugin(tenantScoped);

PurchaseReturnSchema.index({ tenant: 1, returnNo: 1 }, { unique: true });
PurchaseReturnSchema.index({ tenant: 1, purchase: 1 });
PurchaseReturnSchema.index({ tenant: 1, createdAt: -1 });

export type PurchaseReturnDoc = InferSchemaType<typeof PurchaseReturnSchema>;
export const PurchaseReturn: Model<PurchaseReturnDoc> = models.PurchaseReturn || model<PurchaseReturnDoc>("PurchaseReturn", PurchaseReturnSchema);
