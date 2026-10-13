import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    // Empty for the platform super admin; every shop user belongs to exactly one tenant.
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", index: true },
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    /** If set, the user can only work in this branch. Empty = can switch between branches. */
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    role: { type: String, enum: ["superadmin", "owner", "manager", "cashier"], default: "cashier" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    /** 4–6 digit PIN to switch to this user on a shared counter (hashed). */
    pinHash: { type: String, select: false },
    hasPin: { type: Boolean, default: false },
    /** Limits for staff set by the owner: largest discount on a bill (% of the bill), and udhaar allowed or not. */
    maxDiscountPct: { type: Number, min: 0, max: 100 },
    allowUdhaar: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const User: Model<UserDoc> = models.User || model<UserDoc>("User", UserSchema);
