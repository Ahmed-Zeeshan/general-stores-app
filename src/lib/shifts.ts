import type { Types } from "mongoose";
import { round2 } from "./money";
import { khataPaymentsPipeline, PAYMENTS_EXPR } from "./report-agg";
import { Expense, LedgerEntry, Purchase, Sale, SaleReturn } from "@/models";

type Money = { method: string; total: number; count: number };

export type ShiftSummary = {
  from: string;
  to: string;
  bills: number;
  sales: number;
  discount: number;
  tax: number;
  /** Money taken for bills by method, plus "credit" for udhaar given. */
  salesByMethod: Money[];
  returns: number;
  returnCount: number;
  refundsByMethod: Money[];
  udhaarCollectedByMethod: Money[];
  supplierPaymentsByMethod: Money[];
  purchasesPaid: number;
  expensesCash: number;
  expensesOther: number;
  cashIn: number;
  cashOut: number;
  openingCash: number;
  /** The cash that should be in the drawer. */
  expectedCash: number;
  /** How the expected cash is made up (for the Z report). */
  cashFlow: { label: string; amount: number }[];
};

const pick = (list: Money[], method: string) => list.find((x) => x.method === method)?.total ?? 0;
const tidy = (list: { _id: string; total: number; count: number }[]): Money[] =>
  list.filter((x) => Math.abs(x.total) > 0.004).map((x) => ({ method: x._id, total: round2(x.total), count: x.count }));

/** Everything that happened at one branch between `from` and `to`, and the cash that should be in the drawer. */
export async function shiftSummary(
  tid: Types.ObjectId,
  shift: { branch: Types.ObjectId; openedAt: Date; openingCash: number; movements?: { kind: string; amount: number }[] | null },
  to: Date,
): Promise<ShiftSummary> {
  const match = { tenant: tid, branch: shift.branch, createdAt: { $gte: shift.openedAt, $lte: to } };
  const [sales, salesByMethod, returns, refunds, collected, supplierKhata, purchases, expenses] = await Promise.all([
    Sale.aggregate([{ $match: match }, { $group: { _id: null, bills: { $sum: 1 }, total: { $sum: "$total" }, discount: { $sum: "$discount" }, tax: { $sum: "$tax" } } }]),
    Sale.aggregate([
      { $match: match },
      { $project: { pay: PAYMENTS_EXPR } },
      { $unwind: "$pay" },
      { $group: { _id: "$pay.method", total: { $sum: "$pay.amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    SaleReturn.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
    SaleReturn.aggregate([{ $match: { ...match, refund: { $gt: 0 } } }, { $group: { _id: "$refundMethod", total: { $sum: "$refund" }, count: { $sum: 1 } } }]),
    LedgerEntry.aggregate(khataPaymentsPipeline(match, "customer")),
    // Payments to suppliers from their khata (purchase payments are counted from the purchase itself).
    LedgerEntry.aggregate(khataPaymentsPipeline({ ...match, refType: { $in: ["payment", "reversal"] } }, "supplier")),
    Purchase.aggregate([{ $match: { ...match, status: { $ne: "void" } } }, { $group: { _id: null, paid: { $sum: "$amountPaid" } } }]),
    Expense.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ["$method", "cash"] }, total: { $sum: "$amount" } } }]),
  ]);

  const s = sales[0] ?? { bills: 0, total: 0, discount: 0, tax: 0 };
  const byMethod = tidy(salesByMethod);
  const refundsByMethod = tidy(refunds);
  const udhaar = tidy(collected);
  const supplier = tidy(supplierKhata);
  const purchasesPaid = round2(purchases[0]?.paid ?? 0);
  const expensesCash = round2(expenses.find((e) => e._id === "cash")?.total ?? 0);
  const expensesOther = round2(expenses.filter((e) => e._id !== "cash").reduce((a, e) => a + e.total, 0));
  const moves = shift.movements ?? [];
  const cashIn = round2(moves.filter((m) => m.kind === "in").reduce((a, m) => a + m.amount, 0));
  const cashOut = round2(moves.filter((m) => m.kind === "out").reduce((a, m) => a + m.amount, 0));

  const cashFlow = [
    { label: "Opening cash", amount: shift.openingCash },
    { label: "Cash sales", amount: pick(byMethod, "cash") },
    { label: "Udhaar collected in cash", amount: pick(udhaar, "cash") },
    { label: "Cash put in drawer", amount: cashIn },
    { label: "Cash refunds", amount: -pick(refundsByMethod, "cash") },
    { label: "Paid to suppliers (cash)", amount: -pick(supplier, "cash") },
    // Purchases record what was paid; it is taken as cash from the drawer.
    { label: "Purchases paid", amount: -purchasesPaid },
    { label: "Expenses paid in cash", amount: -expensesCash },
    { label: "Cash taken out", amount: -cashOut },
  ].map((x) => ({ ...x, amount: round2(x.amount) }));
  const expectedCash = round2(cashFlow.reduce((a, x) => a + x.amount, 0));

  return {
    from: shift.openedAt.toISOString(),
    to: to.toISOString(),
    bills: s.bills,
    sales: round2(s.total),
    discount: round2(s.discount),
    tax: round2(s.tax),
    salesByMethod: byMethod,
    returns: round2(returns[0]?.total ?? 0),
    returnCount: returns[0]?.count ?? 0,
    refundsByMethod,
    udhaarCollectedByMethod: udhaar,
    supplierPaymentsByMethod: supplier,
    purchasesPaid,
    expensesCash,
    expensesOther,
    cashIn,
    cashOut,
    openingCash: shift.openingCash,
    expectedCash,
    cashFlow,
  };
}
