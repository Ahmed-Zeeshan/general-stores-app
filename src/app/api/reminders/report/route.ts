import { handle, requireTenant } from "@/lib/api";
import { round2 } from "@/lib/money";
import { udhaarReport } from "@/lib/udhaar";

/** Udhaar (receivables) ageing report for all customers who owe money. */
export const GET = handle(async () => {
  const { tid } = await requireTenant(["owner", "manager"]);
  const rows = await udhaarReport(tid);
  const sum = (f: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return {
    rows,
    totals: {
      customers: rows.length,
      balance: sum((r) => r.balance),
      d0_30: sum((r) => r.buckets.d0_30),
      d31_60: sum((r) => r.buckets.d31_60),
      d61_90: sum((r) => r.buckets.d61_90),
      d90: sum((r) => r.buckets.d90),
      withoutPhone: rows.filter((r) => !r.phone).length,
    },
  };
});
