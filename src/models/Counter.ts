import { Schema, model, models, type Model } from "mongoose";

const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });

type CounterDoc = { _id: string; seq: number };
export const Counter: Model<CounterDoc> = models.Counter || model<CounterDoc>("Counter", CounterSchema);

/** Atomic sequential number, e.g. nextNumber("sale", "INV") -> "INV-000001". */
export async function nextNumber(name: string, prefix: string): Promise<string> {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}-${String(c!.seq).padStart(6, "0")}`;
}
