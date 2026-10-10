import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "emerald" },
  },
  { timestamps: true },
);

CategorySchema.plugin(tenantScoped);
CategorySchema.index({ tenant: 1, name: 1 }, { unique: true });

export type CategoryDoc = InferSchemaType<typeof CategorySchema>;
export const Category: Model<CategoryDoc> =
  models.Category || model<CategoryDoc>("Category", CategorySchema);
