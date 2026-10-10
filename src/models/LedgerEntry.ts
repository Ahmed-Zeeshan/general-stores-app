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
    kind: { type: String, enum: ["sale", "purchase", "payment", "return", "opening", "adjustment"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    method: { type: String },
    refType: { type: String },
    refId: { type: Schema.Types.ObjectId },
    refNo: { type: String },
    note: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

LedgerEntrySchema.plugin(tenantScoped);

LedgerEntrySchema.index({ tenant: 1, party: 1, createdAt: -1 });

export type LedgerEntryDoc = InferSchemaType<typeof LedgerEntrySchema>;
export const LedgerEntry: Model<LedgerEntryDoc> =
  models.LedgerEntry || model<LedgerEntryDoc>("LedgerEntry", LedgerEntrySchema);
