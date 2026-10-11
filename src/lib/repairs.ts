import type { Types } from "mongoose";
import { ApiError } from "./api";
import { round2 } from "./money";
import { Repair, type RepairDoc } from "@/models";

export type RepairLean = RepairDoc & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

/** Bill total, money paid so far and what is still to collect. */
export function repairTotals(r: Pick<RepairDoc, "parts" | "labour" | "discount" | "payments" | "creditAmount">) {
  const partsTotal = round2((r.parts ?? []).reduce((a, p) => a + p.price * p.qty, 0));
  const partsCost = round2((r.parts ?? []).reduce((a, p) => a + (p.cost ?? 0) * p.qty, 0));
  const total = Math.max(0, round2(partsTotal + (r.labour ?? 0) - (r.discount ?? 0)));
  const paid = round2((r.payments ?? []).reduce((a, p) => a + p.amount, 0));
  const balance = round2(total - paid - (r.creditAmount ?? 0));
  return { partsTotal, partsCost, total, paid, balance };
}

export const OPEN = ["received", "checking", "waiting_parts", "repairing", "ready"];

export async function loadRepair(tid: Types.ObjectId, id: string) {
  const r = (await Repair.findOne({ _id: id, tenant: tid }).lean()) as RepairLean | null;
  if (!r) throw new ApiError(404, "Repair job not found.");
  return r;
}

export function assertOpen(r: RepairLean) {
  if (r.status === "delivered") throw new ApiError(400, "This phone was already delivered. For a problem under warranty, make a new job as a warranty claim.");
  if (r.status === "cancelled") throw new ApiError(400, "This job was cancelled.");
}

/**
 * Saves a change to a job only if nobody else changed it since it was read (seq), and keeps the
 * totals right. Returns the saved job.
 */
export async function saveRepair(tid: Types.ObjectId, r: RepairLean, update: { $set?: Record<string, unknown>; $push?: Record<string, unknown>; $pull?: Record<string, unknown> }, event?: { status?: string; note?: string; userName: string }) {
  const after = await Repair.findOneAndUpdate(
    { _id: r._id, tenant: tid, seq: r.seq ?? 0 },
    {
      ...update,
      $inc: { seq: 1 },
      ...(event ? { $push: { ...(update.$push ?? {}), history: { ...event, status: event.status ?? r.status, at: new Date() } } } : {}),
    },
    { new: true },
  ).lean();
  if (!after) throw new ApiError(409, "Someone else changed this job just now. Please refresh and try again.");
  const t = repairTotals(after);
  if (t.total !== after.total || t.paid !== after.paid) await Repair.updateOne({ _id: r._id, tenant: tid }, { $set: { total: t.total, paid: t.paid } });
  return { ...after, total: t.total, paid: t.paid } as RepairLean;
}

/** "JOB-000012-2": a number for each payment on a job. */
export function paymentNo(r: Pick<RepairDoc, "jobNo" | "payments">) {
  return `${r.jobNo}-${(r.payments?.length ?? 0) + 1}`;
}
