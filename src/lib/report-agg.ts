import type { PipelineStage } from "mongoose";

/**
 * Aggregation pieces shared by reports, dashboard and shift reports.
 * Sales are counted on the day of the bill; returns are subtracted on the day of the return.
 */

/** Money received per method for a bill (split payments), plus its udhaar part as "credit". */
export const PAYMENTS_EXPR = {
  $filter: {
    input: {
      $concatArrays: [
        {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
            "$payments",
            [{ method: "$paymentMethod", amount: "$amountPaid" }],
          ],
        },
        [{ method: "credit", amount: "$creditAmount" }],
      ],
    },
    as: "p",
    cond: { $and: [{ $gt: ["$$p.amount", 0] }, { $ne: ["$$p.method", null] }] },
  },
};

/**
 * Khata payments by method: money received from customers (partyType "customer") or paid to
 * suppliers ("supplier"), net of cancelled payments. `match` must start with the tenant filter.
 */
export function khataPaymentsPipeline(match: Record<string, unknown>, partyType: "customer" | "supplier"): PipelineStage[] {
  return [
    { $match: { ...match, kind: { $in: ["payment", "reversal"] } } },
    { $lookup: { from: "parties", localField: "party", foreignField: "_id", as: "p", pipeline: [{ $match: { tenant: match.tenant } }, { $project: { type: 1 } }] } },
    { $match: { "p.type": partyType } },
    { $group: { _id: { $ifNull: ["$method", "cash"] }, total: { $sum: { $multiply: ["$amount", -1] } }, count: { $sum: { $cond: [{ $eq: ["$kind", "payment"] }, 1, -1] } } } },
    { $match: { total: { $ne: 0 } } },
    { $sort: { total: -1 as const } },
  ];
}
