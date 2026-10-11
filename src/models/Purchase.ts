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
    /** How much of this line has been sent back to the supplier. */
    returnedQty: { type: Number, default: 0 },
    /** Bought as packs (e.g. 5 Carton of 24): qty above is in units, cost per unit. */
    pack: { type: new Schema({ name: String, size: Number, count: Number, cost: Number }, { _id: false }), default: undefined },
    expiryDate: { type: Date },
    batchNo: { type: String, trim: true },
    /** Phones bought on this line (products with "track IMEI"). */
    serials: { type: [{ device: { type: Schema.Types.ObjectId, ref: "Device" }, imei: String, returned: { type: Boolean, default: false }, _id: false }], default: undefined },
  },
  { _id: false },
);

const PurchaseSchema = new Schema(
  {
    purchaseNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    branchName: { type: String },
    supplier: { type: Schema.Types.ObjectId, ref: "Party" },
    supplierName: { type: String },
    supplierInvoice: { type: String, trim: true },
    items: { type: [PurchaseItemSchema], required: true },
    total: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    note: { type: String },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    /** received → partially_returned → returned; void = cancelled as if it never happened. */
    status: { type: String, enum: ["received", "partially_returned", "returned", "void"], default: "received" },
    returnedTotal: { type: Number, default: 0 },
    /** Increases with every return or cancel; protects against two at the same moment. */
    returnSeq: { type: Number, default: 0 },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedByName: { type: String },
    voidReason: { type: String, trim: true },
  },
  { timestamps: true },
);

PurchaseSchema.plugin(tenantScoped);

PurchaseSchema.index({ tenant: 1, purchaseNo: 1 }, { unique: true });
PurchaseSchema.index({ tenant: 1, createdAt: -1 });

export type PurchaseDoc = InferSchemaType<typeof PurchaseSchema>;
export const Purchase: Model<PurchaseDoc> =
  models.Purchase || model<PurchaseDoc>("Purchase", PurchaseSchema);
