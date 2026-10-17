import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * A return against a bill: some or all of its items. A bill can have several returns.
 * Amounts follow the original bill: each line keeps its share of the bill discount and tax.
 */
const SaleReturnSchema = new Schema(
  {
    returnNo: { type: String, required: true },
    sale: { type: Schema.Types.ObjectId, ref: "Sale", required: true },
    invoiceNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    branchName: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: "Party" },
    customerName: { type: String },
    items: [
      new Schema(
        {
          index: { type: Number, required: true },
          product: { type: Schema.Types.ObjectId, ref: "Product" },
          name: { type: String, required: true },
          unit: String,
          qty: { type: Number, required: true },
          price: Number,
          /** Line value before the bill discount (same basis as Sale.items.total). */
          total: { type: Number, required: true },
          cost: { type: Number, default: 0 },
          /** Phones that came back (products with "track IMEI"). */
          serials: { type: [{ device: { type: Schema.Types.ObjectId, ref: "Device" }, imei: String, _id: false }], default: undefined },
        },
        { _id: false },
      ),
    ],
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    /** Value of the return = what the customer gets back (khata reduction + refund). */
    total: { type: Number, required: true },
    costTotal: { type: Number, default: 0 },
    /** Part taken off the customer's udhaar on this bill. */
    creditReduced: { type: Number, default: 0 },
    /** Part given back to the customer. */
    refund: { type: Number, default: 0 },
    refundMethod: { type: String, enum: ["cash", "card", "jazzcash", "easypaisa", "bank", "khata", "none"], default: "cash" },
    reason: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    /** The cash drawer session the refund was paid from (none if the drawer was closed). */
    shift: { type: Schema.Types.ObjectId, ref: "Shift" },
    shiftNo: { type: String },
    fbrStatus: { type: String, enum: ["none", "synced", "pending"], default: "none" },
    fbrInvoiceNumber: { type: String },
    fbrError: { type: String },
  },
  { timestamps: true },
);

SaleReturnSchema.plugin(tenantScoped);

SaleReturnSchema.index({ tenant: 1, returnNo: 1 }, { unique: true });
SaleReturnSchema.index({ tenant: 1, sale: 1 });
SaleReturnSchema.index({ tenant: 1, createdAt: -1 });
SaleReturnSchema.index({ tenant: 1, fbrStatus: 1 });
SaleReturnSchema.index({ tenant: 1, shift: 1 });

export type SaleReturnDoc = InferSchemaType<typeof SaleReturnSchema>;
export const SaleReturn: Model<SaleReturnDoc> = models.SaleReturn || model<SaleReturnDoc>("SaleReturn", SaleReturnSchema);
