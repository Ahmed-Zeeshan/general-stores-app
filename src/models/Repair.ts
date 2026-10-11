import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REPAIR_STATUSES } from "@/lib/constants";

/** A spare part used in the repair (taken out of stock). */
const RepairPartSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 0.001 },
    /** What the part cost the shop (each) and what the customer is charged (each). */
    cost: { type: Number, default: 0 },
    price: { type: Number, required: true, min: 0 },
    at: { type: Date, default: Date.now },
    userName: { type: String },
  },
  { _id: true },
);

/** Money for the job: advance at booking, payments, refunds (negative amount). */
const RepairPaymentSchema = new Schema(
  {
    kind: { type: String, enum: ["advance", "payment", "refund"], required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ["cash", "card", "jazzcash", "easypaisa", "bank"], default: "cash" },
    ref: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    userName: { type: String },
    receiptNo: { type: String },
  },
  { _id: false },
);

const RepairEventSchema = new Schema(
  { at: { type: Date, default: Date.now }, status: String, note: String, userName: String },
  { _id: false },
);

/** A repair job card: the customer's phone, what is wrong, parts, charges, payments and status. */
const RepairSchema = new Schema(
  {
    jobNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    branchName: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: "Party" },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, required: true, trim: true },
    deviceName: { type: String, required: true, trim: true },
    imei: { type: String, trim: true },
    color: { type: String, trim: true },
    /** Screen lock / pattern the customer gave for testing (optional). */
    lockCode: { type: String, trim: true },
    accessories: { type: [String], default: undefined },
    /** Condition when received: cracked screen, scratches, wet… */
    conditionNotes: { type: String, trim: true },
    problem: { type: String, required: true, trim: true },
    diagnosis: { type: String, trim: true },
    technician: { type: Schema.Types.ObjectId, ref: "User" },
    technicianName: { type: String },
    estimate: { type: Number, min: 0 },
    promisedAt: { type: Date },
    status: { type: String, enum: REPAIR_STATUSES, default: "received" },
    parts: { type: [RepairPartSchema], default: [] },
    labour: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    payments: { type: [RepairPaymentSchema], default: [] },
    /** Totals kept up to date with every change. */
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    /** Part of the bill put on the customer's khata at delivery (udhaar). */
    creditAmount: { type: Number, default: 0 },
    warrantyDays: { type: Number, min: 0, max: 365 },
    warrantyUntil: { type: Date },
    readyAt: { type: Date },
    deliveredAt: { type: Date },
    deliveredByName: { type: String },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    history: { type: [RepairEventSchema], default: [] },
    /** A warranty claim: the earlier job this one is free work for. */
    warrantyOf: { type: String, trim: true },
    /** Increases with every change; protects against two people changing the job at once. */
    seq: { type: Number, default: 0 },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);

RepairSchema.plugin(tenantScoped);
RepairSchema.index({ tenant: 1, jobNo: 1 }, { unique: true });
RepairSchema.index({ tenant: 1, status: 1, createdAt: -1 });
RepairSchema.index({ tenant: 1, createdAt: -1 });
RepairSchema.index({ tenant: 1, customerPhone: 1 });
RepairSchema.index({ tenant: 1, "payments.at": -1 });

export type RepairDoc = InferSchemaType<typeof RepairSchema>;
export const Repair: Model<RepairDoc> = models.Repair || model<RepairDoc>("Repair", RepairSchema);
