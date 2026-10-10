import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Stock sent from one branch to another. */
const TransferSchema = new Schema(
  {
    transferNo: { type: String, required: true },
    from: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    fromName: { type: String, required: true },
    to: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    toName: { type: String, required: true },
    items: [
      new Schema(
        {
          product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
          name: String,
          unit: String,
          qty: { type: Number, required: true },
        },
        { _id: false },
      ),
    ],
    note: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);

TransferSchema.plugin(tenantScoped);

TransferSchema.index({ tenant: 1, transferNo: 1 }, { unique: true });
TransferSchema.index({ tenant: 1, createdAt: -1 });

export type TransferDoc = InferSchemaType<typeof TransferSchema>;
export const Transfer: Model<TransferDoc> = models.Transfer || model<TransferDoc>("Transfer", TransferSchema);
