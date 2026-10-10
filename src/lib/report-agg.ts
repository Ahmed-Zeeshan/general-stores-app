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

