import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const BranchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    isMain: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

BranchSchema.plugin(tenantScoped);

BranchSchema.index({ tenant: 1, name: 1 }, { unique: true });

export type BranchDoc = InferSchemaType<typeof BranchSchema>;
export const Branch: Model<BranchDoc> = models.Branch || model<BranchDoc>("Branch", BranchSchema);
