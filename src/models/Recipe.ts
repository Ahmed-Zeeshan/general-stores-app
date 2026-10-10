import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Bill of materials: one batch uses these ingredients and produces `outputQty` of the output product. */
const RecipeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    output: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    outputQty: { type: Number, required: true, min: 0.001 },
    ingredients: {
      type: [
        new Schema(
          {
            product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
            qty: { type: Number, required: true, min: 0.0001 },
          },
          { _id: false },
        ),
      ],
      validate: [(v: unknown[]) => v.length > 0, "Add at least one ingredient"],
    },
    notes: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

RecipeSchema.plugin(tenantScoped);

RecipeSchema.index({ tenant: 1, active: 1, name: 1 });

export type RecipeDoc = InferSchemaType<typeof RecipeSchema>;
export const Recipe: Model<RecipeDoc> = models.Recipe || model<RecipeDoc>("Recipe", RecipeSchema);
