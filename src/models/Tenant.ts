import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** A tenant is one shop: its settings (managed by the owner) and its plan limits (managed by the super admin). */
const TenantSchema = new Schema(
  {
    // --- Managed by super admin ---
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    maxUsers: { type: Number, default: 3, min: 1 },
    plan: { type: String, trim: true, default: "Standard" },
    expiresAt: { type: Date },
    adminNotes: { type: String, trim: true },

    // --- Managed by shop owner ---
    shopName: { type: String, required: true, trim: true },
    shopType: { type: String, enum: ["karyana", "general", "bakery", "other"], default: "general" },
    ownerName: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    ntn: { type: String, trim: true },
    strn: { type: String, trim: true },
    taxEnabled: { type: Boolean, default: false },
    taxRate: { type: Number, default: 18, min: 0, max: 100 },
    pricesIncludeTax: { type: Boolean, default: true },
    receiptFooter: { type: String, default: "Thank you for shopping! / خریداری کا شکریہ" },
    currency: { type: String, default: "PKR" },

    // --- FBR POS integration ---
    fbrEnabled: { type: Boolean, default: false },
    fbrMode: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
    fbrPosId: { type: String, trim: true },
    fbrToken: { type: String, trim: true, select: false },
    fbrDefaultPct: { type: String, trim: true, default: "11001010" },
  },
  { timestamps: true },
);

export type TenantDoc = InferSchemaType<typeof TenantSchema>;
export const Tenant: Model<TenantDoc> = models.Tenant || model<TenantDoc>("Tenant", TenantSchema);
