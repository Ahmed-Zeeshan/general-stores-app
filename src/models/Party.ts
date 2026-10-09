import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * A Party is a customer or a supplier.
 * balance > 0 means: customer owes the shop (udhaar) / shop owes the supplier.
 */
const PartySchema = new Schema(
  {
    type: { type: String, enum: ["customer", "supplier"], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    creditLimit: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PartySchema.index({ type: 1, name: 1 });
PartySchema.index({ type: 1, phone: 1 });

export type PartyDoc = InferSchemaType<typeof PartySchema>;
export const Party: Model<PartyDoc> = models.Party || model<PartyDoc>("Party", PartySchema);
