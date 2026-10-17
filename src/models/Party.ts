import { tenantScoped } from "./tenant-plugin";
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
    /** Wholesale customers get the wholesale prices automatically. */
    priceLevel: { type: String, enum: ["retail", "wholesale"], default: "retail" },
    /** Loyalty points balance (customers). */
    points: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    /** This customer's own prices (per loose unit), used on every bill before wholesale / normal prices. */
    prices: {
      type: [{ _id: false, product: { type: Schema.Types.ObjectId, ref: "Product", required: true }, price: { type: Number, required: true, min: 0 } }],
      default: undefined,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PartySchema.plugin(tenantScoped);

PartySchema.index({ tenant: 1, type: 1, name: 1 });
PartySchema.index({ tenant: 1, type: 1, phone: 1 });

export type PartyDoc = InferSchemaType<typeof PartySchema>;
export const Party: Model<PartyDoc> = models.Party || model<PartyDoc>("Party", PartySchema);
