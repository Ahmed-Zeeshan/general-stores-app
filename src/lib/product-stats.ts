import type { Types } from "mongoose";
import { Sale } from "@/models";

export type Movement = { sold30: number; lastSoldAt: string | null };

const DAY = 864e5;

/**
 * How each product has been selling: units sold in the last 30 days and when it last sold.
 * Used on the Products page for the movement column and the "dead stock" filter (not sold for a
 * while but still in stock). Scoped to one branch, or the whole shop when `branch` is null.
 * Looks back `lookbackDays` (default 120) so an all-time scan is never needed; a product with no
 * sale in that window gets `lastSoldAt: null` and counts as dead stock.
 */
export async function productMovement(
  tid: Types.ObjectId,
  branch: Types.ObjectId | null,
  now = new Date(),
  lookbackDays = 120,
): Promise<Map<string, Movement>> {
  const since = new Date(now.getTime() - lookbackDays * DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const match: Record<string, unknown> = { tenant: tid, createdAt: { $gte: since } };
  if (branch) match.branch = branch;
  const rows = await Sale.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $match: { "items.product": { $ne: null } } },
    {
      $group: {
        _id: "$items.product",
        lastSoldAt: { $max: "$createdAt" },
        sold30: {
          $sum: {
            $cond: [{ $gte: ["$createdAt", since30] }, { $subtract: ["$items.qty", { $ifNull: ["$items.returnedQty", 0] }] }, 0],
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { sold30: Math.max(0, r.sold30 as number), lastSoldAt: (r.lastSoldAt as Date | null)?.toISOString() ?? null }]));
}
