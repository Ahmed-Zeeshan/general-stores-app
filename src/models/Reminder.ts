import { tenantScoped } from "./tenant-plugin";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** A udhaar reminder or khata statement sent to a customer through WhatsApp. */
const ReminderSchema = new Schema(
  {
    party: { type: Schema.Types.ObjectId, ref: "Party", required: true },
    partyName: { type: String },
    phone: { type: String },
    amount: { type: Number, default: 0 },
    kind: { type: String, enum: ["reminder", "statement"], default: "reminder" },
    channel: { type: String, enum: ["whatsapp"], default: "whatsapp" },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
  },
  { timestamps: true },
);

ReminderSchema.plugin(tenantScoped);

ReminderSchema.index({ tenant: 1, party: 1, createdAt: -1 });
ReminderSchema.index({ tenant: 1, createdAt: -1 });

export type ReminderDoc = InferSchemaType<typeof ReminderSchema>;
export const Reminder: Model<ReminderDoc> = models.Reminder || model<ReminderDoc>("Reminder", ReminderSchema);
