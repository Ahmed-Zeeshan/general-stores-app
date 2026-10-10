import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Audit trail of every stock change. `qty` is signed (+ in, - out). */
const StockMovementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    type: { type: String, enum: ["sale", "purchase", "return", "adjustment", "wastage", "opening", "production", "import", "transfer", "purchase_return", "void"], required: true },
    qty: { type: Number, required: true },
    stockAfter: { type: Number },
    refNo: { type: String },
    note: { type: String },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

StockMovementSchema.plugin(tenantScoped);

StockMovementSchema.index({ tenant: 1, product: 1, createdAt: -1 });

export type StockMovementDoc = InferSchemaType<typeof StockMovementSchema>;
export const StockMovement: Model<StockMovementDoc> =
  models.StockMovement || model<StockMovementDoc>("StockMovement", StockMovementSchema);
