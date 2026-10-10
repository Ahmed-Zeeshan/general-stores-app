import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Quantity of one product at one branch. Product.stock holds the total of all branches. */
const StockLevelSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    qty: { type: Number, default: 0 },
  },
  { timestamps: true },
);

StockLevelSchema.plugin(tenantScoped);

StockLevelSchema.index({ tenant: 1, product: 1, branch: 1 }, { unique: true });
StockLevelSchema.index({ tenant: 1, branch: 1 });

export type StockLevelDoc = InferSchemaType<typeof StockLevelSchema>;
export const StockLevel: Model<StockLevelDoc> = models.StockLevel || model<StockLevelDoc>("StockLevel", StockLevelSchema);
