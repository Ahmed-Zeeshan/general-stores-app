import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Loyalty points history of a customer (earned on bills, spent, taken back on returns). */
const PointsEntrySchema = new Schema(
  {
    party: { type: Schema.Types.ObjectId, ref: "Party", required: true },
    kind: { type: String, enum: ["earn", "redeem", "return", "adjust"], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    refType: { type: String },
    refId: { type: Schema.Types.ObjectId },
    refNo: { type: String },
    note: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PointsEntrySchema.plugin(tenantScoped);
PointsEntrySchema.index({ tenant: 1, party: 1, createdAt: -1 });

export type PointsEntryDoc = InferSchemaType<typeof PointsEntrySchema>;
export const PointsEntry: Model<PointsEntryDoc> = models.PointsEntry || model<PointsEntryDoc>("PointsEntry", PointsEntrySchema);
