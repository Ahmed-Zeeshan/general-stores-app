import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * An offer applied automatically at the counter:
 *  percent — X% off the items it covers
 *  amount  — Rs X off each unit it covers
 *  bxgy    — buy X get Y free (same item)
 *  bill    — X% or Rs X off the whole bill when it reaches a minimum amount
 */
const PromotionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["percent", "amount", "bxgy", "bill"], required: true },
    /** percent: % off · amount: Rs off per unit · bill: % or Rs off (see billMode). */
    value: { type: Number, default: 0, min: 0 },
    billMode: { type: String, enum: ["percent", "amount"], default: "percent" },
    buyQty: { type: Number, min: 1 },
    freeQty: { type: Number, min: 1 },
    minAmount: { type: Number, default: 0, min: 0 },
    /** Upper limit of the discount for one bill (bill offers in %). 0 = no limit. */
    maxDiscount: { type: Number, default: 0, min: 0 },
    appliesTo: { type: String, enum: ["all", "products", "categories"], default: "all" },
    products: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
    categories: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },
    startsAt: { type: Date },
    endsAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PromotionSchema.plugin(tenantScoped);
PromotionSchema.index({ tenant: 1, active: 1 });

export type PromotionDoc = InferSchemaType<typeof PromotionSchema>;
export const Promotion: Model<PromotionDoc> = models.Promotion || model<PromotionDoc>("Promotion", PromotionSchema);
