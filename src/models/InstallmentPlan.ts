import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Goods sold on installments (qist): the bill, advance, markup, monthly schedule and the money
 * collected. Payments are matched to the schedule oldest-first when it is shown, so the schedule is
 * always right even after a payment is cancelled.
 */
const InstallmentPlanSchema = new Schema(
  {
    planNo: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    branchName: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: "Party", required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, trim: true },
    customerCnic: { type: String, trim: true },
    customerAddress: { type: String, trim: true },
    guarantor: {
      type: new Schema({ name: String, cnic: String, phone: String, address: String, relation: String }, { _id: false }),
      default: undefined,
    },
    sale: { type: Schema.Types.ObjectId, ref: "Sale", required: true },
    invoiceNo: { type: String, required: true },
    /** What was sold (names and IMEIs), for the agreement and lists. */
    itemsText: { type: String },
    /** Bill total (cash price) and the advance paid on the bill. */
    cashPrice: { type: Number, required: true },
    advance: { type: Number, default: 0 },
    markupType: { type: String, enum: ["percent", "amount"], default: "percent" },
    markupValue: { type: Number, default: 0 },
    markup: { type: Number, default: 0 },
    /** To be paid in installments: cash price − advance + markup. */
    financed: { type: Number, required: true },
    months: { type: Number, required: true, min: 1, max: 60 },
    schedule: { type: [{ no: Number, dueDate: Date, amount: Number, _id: false }], default: [] },
    /** Money collected (payment +, cancelled payment / refund −). */
    payments: {
      type: [
        {
          kind: { type: String, enum: ["payment", "reversal", "refund"], default: "payment" },
          amount: { type: Number, required: true },
          method: { type: String, enum: ["cash", "card", "jazzcash", "easypaisa", "bank"], default: "cash" },
          ref: String,
          note: String,
          receiptNo: String,
          reverses: String,
          reversed: { type: Boolean, default: false },
          at: { type: Date, default: Date.now },
          userName: String,
        },
      ],
      default: [],
    },
    paid: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "completed", "cancelled"], default: "active" },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    /** Left unpaid when the plan was closed (goods taken back / written off). */
    writtenOff: { type: Number, default: 0 },
    lastReminderAt: { type: Date },
    notes: { type: String, trim: true },
    seq: { type: Number, default: 0 },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);
InstallmentPlanSchema.plugin(tenantScoped);
InstallmentPlanSchema.index({ tenant: 1, planNo: 1 }, { unique: true });
InstallmentPlanSchema.index({ tenant: 1, status: 1, createdAt: -1 });
InstallmentPlanSchema.index({ tenant: 1, customer: 1 });
InstallmentPlanSchema.index({ tenant: 1, sale: 1 });
InstallmentPlanSchema.index({ tenant: 1, "payments.at": -1 });

export type InstallmentPlanDoc = InferSchemaType<typeof InstallmentPlanSchema>;
export const InstallmentPlan: Model<InstallmentPlanDoc> = models.InstallmentPlan || model<InstallmentPlanDoc>("InstallmentPlan", InstallmentPlanSchema);
