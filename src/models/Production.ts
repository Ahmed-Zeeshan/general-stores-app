import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** One production run (e.g. "baked 3 batches of bread"): ingredients consumed, output produced. */
const ProductionSchema = new Schema(
  {
    productionNo: { type: String, required: true },
    recipe: { type: Schema.Types.ObjectId, ref: "Recipe" },
    recipeName: { type: String, required: true },
    output: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    outputName: { type: String, required: true },
    outputUnit: { type: String },
    batches: { type: Number, required: true },
    outputQty: { type: Number, required: true },
    ingredients: [
      new Schema(
        {
          product: { type: Schema.Types.ObjectId, ref: "Product" },
          name: String,
          unit: String,
          qty: Number,
          cost: Number,
        },
        { _id: false },
      ),
    ],
    totalCost: { type: Number, required: true },
    unitCost: { type: Number, required: true },
    note: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);

ProductionSchema.plugin(tenantScoped);

ProductionSchema.index({ tenant: 1, productionNo: 1 }, { unique: true });
ProductionSchema.index({ tenant: 1, createdAt: -1 });

export type ProductionDoc = InferSchemaType<typeof ProductionSchema>;
export const Production: Model<ProductionDoc> =
  models.Production || model<ProductionDoc>("Production", ProductionSchema);
