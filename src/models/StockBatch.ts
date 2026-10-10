import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * A lot of one product at one branch with its own expiry date (only for products with
 * "track expiry" on). Sales take from the batch that expires first (FEFO).
 */
const StockBatchSchema = new Schema(
  {
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    /** What is left of this batch. */
    qty: { type: Number, required: true },
    initialQty: { type: Number, required: true },
    expiryDate: { type: Date, default: null },
    batchNo: { type: String, trim: true },
    cost: { type: Number, default: 0 },
    /** Where it came from (purchase, production, opening stock, transfer …). */
    sourceType: { type: String },
    sourceId: { type: Schema.Types.ObjectId },
    refNo: { type: String },
  },
  { timestamps: true },
);

StockBatchSchema.plugin(tenantScoped);

StockBatchSchema.index({ tenant: 1, branch: 1, product: 1, qty: 1 });
StockBatchSchema.index({ tenant: 1, expiryDate: 1, qty: 1 });
StockBatchSchema.index({ tenant: 1, sourceId: 1 });

export type StockBatchDoc = InferSchemaType<typeof StockBatchSchema>;
export const StockBatch: Model<StockBatchDoc> = models.StockBatch || model<StockBatchDoc>("StockBatch", StockBatchSchema);
