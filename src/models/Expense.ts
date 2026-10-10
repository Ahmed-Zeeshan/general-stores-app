import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export { EXPENSE_CATEGORIES } from "@/lib/constants";

const ExpenseSchema = new Schema(
  {
    category: { type: String, required: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    amount: { type: Number, required: true, min: 0 },
    /** "cash" = paid from the cash drawer (counts in the day close); otherwise bank / wallet. */
    method: { type: String, enum: ["cash", "bank", "jazzcash", "easypaisa", "card"], default: "cash" },
    note: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

ExpenseSchema.plugin(tenantScoped);

ExpenseSchema.index({ tenant: 1, date: -1 });

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema>;
export const Expense: Model<ExpenseDoc> = models.Expense || model<ExpenseDoc>("Expense", ExpenseSchema);
