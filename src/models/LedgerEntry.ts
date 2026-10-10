import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Khata entry for a customer or supplier.
 * `amount` is signed: positive increases what is owed (sale on credit / purchase on credit),
 * negative decreases it (payment received / payment made).
 */
const LedgerEntrySchema = new Schema(
  {
    party: { type: Schema.Types.ObjectId, ref: "Party", required: true, index: true },
    kind: { type: String, enum: ["sale", "purchase", "payment", "return", "opening", "adjustment", "reversal"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    method: { type: String },
    refType: { type: String },
    refId: { type: Schema.Types.ObjectId },
    refNo: { type: String },
    note: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    /** Branch where the money changed hands (payments). */
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    /** A payment entered by mistake is cancelled with a "reversal" entry; both stay in the khata. */
    reversed: { type: Boolean, default: false },
    reversedAt: { type: Date },
    reversedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reverseReason: { type: String, trim: true },
  },
  { timestamps: true },
);

LedgerEntrySchema.plugin(tenantScoped);

LedgerEntrySchema.index({ tenant: 1, party: 1, createdAt: -1 });
LedgerEntrySchema.index({ tenant: 1, kind: 1, createdAt: -1 });

export type LedgerEntryDoc = InferSchemaType<typeof LedgerEntrySchema>;
export const LedgerEntry: Model<LedgerEntryDoc> =
  models.LedgerEntry || model<LedgerEntryDoc>("LedgerEntry", LedgerEntrySchema);
