import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Who did what and when (sensitive actions only). Kept for about 13 months. */
const ActivityLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    role: { type: String },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    /** Machine-readable kind, e.g. "sale.discount", "payment.cancel", "stock.adjust". */
    action: { type: String, required: true },
    /** One line a shopkeeper can read. */
    summary: { type: String, required: true },
    refType: { type: String },
    refId: { type: Schema.Types.ObjectId },
    refNo: { type: String },
    /** Amount involved, if any (for sorting / spotting large changes). */
    amount: { type: Number },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ActivityLogSchema.plugin(tenantScoped);

ActivityLogSchema.index({ tenant: 1, createdAt: -1 });
ActivityLogSchema.index({ tenant: 1, action: 1, createdAt: -1 });
ActivityLogSchema.index({ tenant: 1, user: 1, createdAt: -1 });
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

export type ActivityLogDoc = InferSchemaType<typeof ActivityLogSchema>;
export const ActivityLog: Model<ActivityLogDoc> = models.ActivityLog || model<ActivityLogDoc>("ActivityLog", ActivityLogSchema);
