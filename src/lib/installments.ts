import type { Types } from "mongoose";
import { ApiError } from "./api";
import { round2 } from "./money";
import { planState } from "./installment-calc";
import { InstallmentPlan, type InstallmentPlanDoc } from "@/models";

export type PlanLean = InstallmentPlanDoc & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

/** The plan with its schedule state (paid / late per month, balance, next due). */
export function withState(p: PlanLean, now = new Date()) {
  return { ...p, ...planState({ schedule: p.schedule as never, paid: p.paid, financed: p.financed, writtenOff: p.writtenOff }, now) };
}

export async function loadPlan(tid: Types.ObjectId, id: string) {
  const p = (await InstallmentPlan.findOne({ _id: id, tenant: tid }).lean()) as PlanLean | null;
  if (!p) throw new ApiError(404, "Installment plan not found.");
  return p;
}

/** Saves a change only if nobody changed the plan meanwhile; keeps `paid` and the status right. */
export async function savePlan(tid: Types.ObjectId, p: PlanLean, update: { $set?: Record<string, unknown>; $push?: Record<string, unknown> }) {
  const after = (await InstallmentPlan.findOneAndUpdate({ _id: p._id, tenant: tid, seq: p.seq ?? 0 }, { ...update, $inc: { seq: 1 } }, { new: true }).lean()) as PlanLean | null;
  if (!after) throw new ApiError(409, "Someone else changed this plan just now. Please refresh and try again.");
  const paid = round2((after.payments ?? []).reduce((a, x) => a + x.amount, 0));
  const set: Record<string, unknown> = {};
  if (paid !== after.paid) set.paid = paid;
  if (after.status !== "cancelled") {
    const done = paid >= after.financed - 0.004;
    if (done && after.status !== "completed") Object.assign(set, { status: "completed", completedAt: new Date() });
    if (!done && after.status === "completed") Object.assign(set, { status: "active", completedAt: null });
  }
  if (Object.keys(set).length) await InstallmentPlan.updateOne({ _id: p._id, tenant: tid }, { $set: set });
  return { ...after, ...set } as PlanLean;
}

export function receiptNo(p: Pick<InstallmentPlanDoc, "planNo" | "payments">) {
  return `${p.planNo}-${(p.payments?.length ?? 0) + 1}`;
}
