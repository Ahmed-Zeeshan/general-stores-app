import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

import { PAYMENT_METHODS, TENDER_METHODS } from "@/lib/constants";

export { PAYMENT_METHODS, TENDER_METHODS };

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
    /** How many of this line have been returned so far. */
    returnedQty: { type: Number, default: 0 },
    /** Sold as packs (e.g. 2 Carton of 24): qty above is in units, price per unit. */
    pack: { type: new Schema({ name: String, size: Number, count: Number, price: Number }, { _id: false }), default: undefined },
    /** Price level used (wholesale customers). */
    wholesale: { type: Boolean, default: undefined },
  },
  { _id: false },
);

/** Money taken for the bill by each method (amounts applied to the bill, change excluded). */
const SalePaymentSchema = new Schema(
  {
    method: { type: String, enum: TENDER_METHODS, required: true },
    amount: { type: Number, required: true },
    /** Transaction ID / last digits for card, JazzCash, Easypaisa or bank payments. */
    ref: { type: String, trim: true },
  },
  { _id: false },
);

const SaleSchema = new Schema(
  {
    invoiceNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    branchName: { type: String },
    /** Set by the POS for bills made offline, so re-sending never creates duplicates. */
    clientId: { type: String },
    offline: { type: Boolean, default: false },
    items: { type: [SaleItemSchema], required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    total: { type: Number, required: true },
    costTotal: { type: Number, default: 0 },
    /** Main method (largest payment), or "credit" when nothing was paid now. */
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    payments: { type: [SalePaymentSchema], default: undefined },
    amountPaid: { type: Number, default: 0 },
    change: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 },
    customer: { type: Schema.Types.ObjectId, ref: "Party" },
    customerName: { type: String },
    cashier: { type: Schema.Types.ObjectId, ref: "User" },
    cashierName: { type: String },
    status: { type: String, enum: ["completed", "partially_returned", "returned"], default: "completed" },
    returnedAt: { type: Date },
    /** Value of all returns so far, and how much of it reduced this bill's udhaar. */
    returnedTotal: { type: Number, default: 0 },
    creditReturned: { type: Number, default: 0 },
    /** Increases with every return; protects against two returns at the same moment. */
    returnSeq: { type: Number, default: 0 },
    note: { type: String },
    // FBR POS integration
    fbrStatus: { type: String, enum: ["none", "synced", "pending", "failed"], default: "none" },
    fbrInvoiceNumber: { type: String },
    fbrReturnInvoiceNumber: { type: String },
    fbrError: { type: String },
    fbrAttempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

SaleSchema.plugin(tenantScoped);

SaleSchema.index({ tenant: 1, invoiceNo: 1 }, { unique: true });
SaleSchema.index({ tenant: 1, createdAt: -1 });
SaleSchema.index({ tenant: 1, status: 1, createdAt: -1 });
SaleSchema.index({ tenant: 1, fbrStatus: 1 });
SaleSchema.index({ tenant: 1, branch: 1, createdAt: -1 });
SaleSchema.index({ tenant: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } });

export type SaleDoc = InferSchemaType<typeof SaleSchema>;
export const Sale: Model<SaleDoc> = models.Sale || model<SaleDoc>("Sale", SaleSchema);
