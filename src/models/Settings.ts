import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const SettingsSchema = new Schema(
  {
    key: { type: String, default: "shop", unique: true },
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
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof SettingsSchema>;
export const Settings: Model<SettingsDoc> =
  models.Settings || model<SettingsDoc>("Settings", SettingsSchema);
