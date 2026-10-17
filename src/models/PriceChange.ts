import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** One change of an item's sale, wholesale or cost price: who, when, from what to what, and why. */
const PriceChangeSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    field: { type: String, enum: ["salePrice", "wholesalePrice", "costPrice"], required: true },
    from: { type: Number },
    to: { type: Number },
    /** added = new item, edit = changed by hand, purchase / import / bulk / production = changed by those. */
    source: { type: String, enum: ["added", "edit", "purchase", "import", "bulk", "production"], required: true },
    refNo: { type: String },
    /** The purchase / production run the change came from. */
    refId: { type: Schema.Types.ObjectId },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PriceChangeSchema.plugin(tenantScoped);
PriceChangeSchema.index({ tenant: 1, product: 1, createdAt: -1 });

export type PriceChangeDoc = InferSchemaType<typeof PriceChangeSchema>;
export const PriceChange: Model<PriceChangeDoc> = models.PriceChange || model<PriceChangeDoc>("PriceChange", PriceChangeSchema);
