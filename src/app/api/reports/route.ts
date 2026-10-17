import { dateRange, handle, TIMEZONE } from "@/lib/api";
import { reportBranchFilter, requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { khataPaymentsPipeline, PAYMENTS_EXPR } from "@/lib/report-agg";
import { mobileReport } from "@/lib/mobile-report";
import { Expense, LedgerEntry, Purchase, PurchaseReturn, Sale, SaleReturn, StockMovement, Tenant } from "@/models";

/**
 * Profit & loss for a period. Bills count on their own date; returns are subtracted on the date
 * they were made (standard retail practice), so a past day's report never changes afterwards.
 */
export const GET = handle(async (req) => {
  const ctx = await requireBranch(["owner", "manager"]);
  const { tid } = ctx;
  const url = new URL(req.url);
  const { from, to } = dateRange(url, 6);
  const branch = reportBranchFilter(ctx, url.searchParams.get("branch"));
  const b = branch ? { branch } : {};
  const match = { tenant: tid, ...b, createdAt: { $gte: from, $lte: to } };
  const day = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } };

  const [summary, byMethod, refundsByMethod, byDay, returnsByDay, topItems, expenses, purchases, returns, byBranch, returnsByBranch, collected, paidOut, purchaseReturns] = await Promise.all([
    Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          bills: { $sum: 1 },
          subtotal: { $sum: "$subtotal" },
          discount: { $sum: "$discount" },
          tax: { $sum: "$tax" },
          total: { $sum: "$total" },
          cost: { $sum: "$costTotal" },
          credit: { $sum: "$creditAmount" },
        },
      },
    ]),
    Sale.aggregate([
      { $match: match },
      { $project: { pay: PAYMENTS_EXPR } },
      { $unwind: "$pay" },
      { $group: { _id: "$pay.method", total: { $sum: "$pay.amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    SaleReturn.aggregate([
      { $match: match },
      { $group: { _id: "$refundMethod", total: { $sum: "$refund" }, credit: { $sum: "$creditReduced" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: match },
      { $group: { _id: day, total: { $sum: "$total" }, profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } }, bills: { $sum: 1 } } },
    ]),
    SaleReturn.aggregate([
      { $match: match },
      { $group: { _id: day, total: { $sum: "$total" }, profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } } } },
    ]),
    Sale.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $project: {
          name: "$items.name",
          unit: "$items.unit",
          kept: { $subtract: ["$items.qty", { $ifNull: ["$items.returnedQty", 0] }] },
          share: {
            $cond: [{ $gt: ["$items.qty", 0] }, { $divide: [{ $subtract: ["$items.qty", { $ifNull: ["$items.returnedQty", 0] }] }, "$items.qty"] }, 0],
          },
          total: "$items.total",
          cost: "$items.cost",
        },
      },
      { $match: { kept: { $gt: 0 } } },
      {
        $group: {
          _id: "$name",
          unit: { $first: "$unit" },
          qty: { $sum: "$kept" },
          total: { $sum: { $multiply: ["$total", "$share"] } },
          profit: { $sum: { $subtract: [{ $multiply: ["$total", "$share"] }, { $multiply: ["$kept", "$cost"] }] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]),
    Expense.aggregate([
      { $match: { tenant: tid, ...b, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ]),
    Purchase.aggregate([
      { $match: { tenant: tid, ...b, createdAt: { $gte: from, $lte: to }, status: { $ne: "void" } } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    SaleReturn.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          tax: { $sum: "$tax" },
          cost: { $sum: "$costTotal" },
          credit: { $sum: "$creditReduced" },
          refund: { $sum: "$refund" },
          count: { $sum: 1 },
        },
      },
    ]),
    Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$branch",
          name: { $first: "$branchName" },
          total: { $sum: "$total" },
          profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } },
          bills: { $sum: 1 },
        },
      },
    ]),
    SaleReturn.aggregate([
      { $match: match },
      { $group: { _id: "$branch", total: { $sum: "$total" }, profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } } } },
    ]),
    LedgerEntry.aggregate(khataPaymentsPipeline(match, "customer")),
    LedgerEntry.aggregate(khataPaymentsPipeline(match, "supplier")),
    PurchaseReturn.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }]),
  ]);

  const s = summary[0] ?? { bills: 0, subtotal: 0, discount: 0, tax: 0, total: 0, cost: 0, credit: 0 };
  const r = returns[0] ?? { total: 0, tax: 0, cost: 0, credit: 0, refund: 0, count: 0 };
  const netSales = round2(s.total - r.total);
  const tax = round2(s.tax - r.tax);
  const cost = round2(s.cost - r.cost);
  const grossProfit = round2(netSales - tax - cost);
  const expenseTotal = round2(expenses.reduce((a, e) => a + e.total, 0));
  // Mobile shop services earn outside the bills: repair profit and Easyload / wallet commission and fees.
  const modules = ((await Tenant.findById(tid).select("modules").lean()) as { modules?: Record<string, boolean> } | null)?.modules ?? {};
  const mobile = Object.values(modules).some(Boolean) ? await mobileReport(tid, branch ?? null, from, to, modules) : null;
  const repairProfit = mobile?.repairs?.profit ?? 0;
  const walletProfit = mobile?.wallets?.profit ?? 0;
  const installmentProfit = mobile?.installments?.profit ?? 0;
  // Stock thrown away (wastage / expired) is a loss, at the item's cost price.
  const lost = await StockMovement.aggregate([
    { $match: { ...match, type: "wastage" } },
    { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "p", pipeline: [{ $project: { costPrice: 1 } }] } },
    { $group: { _id: null, value: { $sum: { $multiply: [{ $abs: "$qty" }, { $ifNull: [{ $first: "$p.costPrice" }, 0] }] } } } },
  ]);
  const wastage = round2(lost[0]?.value ?? 0);

  const days = new Map<string, { date: string; total: number; profit: number; bills: number }>();
  for (const d of byDay) days.set(d._id, { date: d._id, total: d.total, profit: d.profit, bills: d.bills });
  for (const d of returnsByDay) {
    const row = days.get(d._id) ?? { date: d._id, total: 0, profit: 0, bills: 0 };
    row.total -= d.total;
    row.profit -= d.profit;
    days.set(d._id, row);
  }
  const branches = new Map<string, { _id: unknown; name?: string; total: number; profit: number; bills: number }>();
  for (const x of byBranch) branches.set(String(x._id), { _id: x._id, name: x.name, total: x.total, profit: x.profit, bills: x.bills });
  for (const x of returnsByBranch) {
    const row = branches.get(String(x._id)) ?? { _id: x._id, total: 0, profit: 0, bills: 0 };
    row.total -= x.total;
    row.profit -= x.profit;
    branches.set(String(x._id), row);
  }

  return {
    from,
    to,
    summary: {
      bills: s.bills,
      grossSales: round2(s.subtotal),
      discount: round2(s.discount),
      salesBeforeReturns: round2(s.total),
      returns: round2(r.total),
      returnCount: r.count,
      refunds: round2(r.refund),
      tax,
      netSales,
      cost,
      grossProfit,
      expenses: expenseTotal,
      repairProfit,
      walletProfit,
      installmentProfit,
      wastage,
      netProfit: round2(grossProfit + repairProfit + walletProfit + installmentProfit - wastage - expenseTotal),
      credit: round2(s.credit - r.credit),
      avgBill: s.bills ? round2(s.total / s.bills) : 0,
      purchases: round2((purchases[0]?.total ?? 0) - (purchaseReturns[0]?.total ?? 0)),
      purchaseReturns: round2(purchaseReturns[0]?.total ?? 0),
      udhaarCollected: round2(collected.reduce((a, x) => a + x.total, 0)),
      paidToSuppliers: round2(paidOut.reduce((a, x) => a + x.total, 0)),
    },
    mobile,
    collectedByMethod: collected.map((x) => ({ ...x, total: round2(x.total) })),
    byMethod,
    refundsByMethod,
    byDay: [...days.values()].sort((a, c) => a.date.localeCompare(c.date)).map((d) => ({ ...d, total: round2(d.total), profit: round2(d.profit) })),
    topItems: topItems.map((t) => ({ ...t, qty: Math.round(t.qty * 1000) / 1000, total: round2(t.total), profit: round2(t.profit) })),
    expenses,
    branch: branch ? String(branch) : "all",
    byBranch: [...branches.values()].sort((a, c) => c.total - a.total).map((x) => ({ ...x, total: round2(x.total), profit: round2(x.profit) })),
  };
});
