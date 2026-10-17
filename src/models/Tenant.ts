import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { SHOP_TYPES } from "@/lib/constants";

/** A tenant is one shop: its settings (managed by the owner) and its plan limits (managed by the super admin). */
const TenantSchema = new Schema(
  {
    // --- Managed by super admin ---
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    maxUsers: { type: Number, default: 3, min: 1 },
    maxBranches: { type: Number, default: 1, min: 1 },
    plan: { type: String, trim: true, default: "Standard" },
    expiresAt: { type: Date },
    adminNotes: { type: String, trim: true },

    // --- Managed by shop owner ---
    shopName: { type: String, required: true, trim: true },
    shopType: { type: String, enum: SHOP_TYPES, default: "general" },
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

    // --- WhatsApp udhaar reminders ---
    waTemplate: {
      type: String,
      trim: true,
      default:
        "Assalam o Alaikum {name},\n{shop} ki taraf se yaad-dehani: aap ke khate mein {amount} baqaya hai.\nMeharbani farma kar jald ada kar dein. Shukriya!\n{shop} {shopPhone}",
    },
    // --- Loyalty points ---
    loyaltyEnabled: { type: Boolean, default: false },
    /** Bills only while the branch's cash drawer is open (bills made offline are still accepted). */
    requireOpenDrawer: { type: Boolean, default: false },
    /** Customer earns 1 point for every this many rupees paid. */
    loyaltyEarnPer: { type: Number, default: 100, min: 1 },
    /** What one point is worth when spent (Rs). */
    loyaltyPointValue: { type: Number, default: 1, min: 0 },
    /** Points needed before they can be spent. */
    loyaltyMinRedeem: { type: Number, default: 100, min: 0 },

    /** Sent after a customer pays udhaar. Empty = the built-in message. */
    waPaymentTemplate: { type: String, trim: true },

    // --- Optional features (Settings → Features) ---
    modules: {
      type: new Schema(
        { phones: { type: Boolean, default: false }, repairs: { type: Boolean, default: false }, wallets: { type: Boolean, default: false }, installments: { type: Boolean, default: false } },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** Owner's WhatsApp number for the end-of-day summary (empty = the shop phone). */
    ownerPhone: { type: String, trim: true },
    /** Address customers can open (e.g. https://myshop.example.com) — adds bill / slip links to WhatsApp messages. */
    publicUrl: { type: String, trim: true },
    /** The owner closed the "Get your shop ready" guide on the dashboard. */
    setupDismissedAt: { type: Date },
  },
  { timestamps: true },
);

export type TenantDoc = InferSchemaType<typeof TenantSchema>;
export const Tenant: Model<TenantDoc> = models.Tenant || model<TenantDoc>("Tenant", TenantSchema);
