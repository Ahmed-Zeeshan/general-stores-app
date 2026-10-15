import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Wrong passwords / PINs per account, kept in the database so a restart does not reset them. */
const AuthThrottleSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  first: { type: Date, required: true },
  /** MongoDB removes the row by itself after this time. */
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export type AuthThrottleDoc = InferSchemaType<typeof AuthThrottleSchema>;
export const AuthThrottle: Model<AuthThrottleDoc> = models.AuthThrottle || model<AuthThrottleDoc>("AuthThrottle", AuthThrottleSchema);
