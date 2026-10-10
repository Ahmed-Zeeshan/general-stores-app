import { addDays, endOfDay, handle, startOfDay, TIMEZONE } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { PAYMENTS_EXPR } from "@/lib/report-agg";
import { Expense, Party, Product, Sale, SaleReturn } from "@/models";

export const GET = handle(async () => {
  const { tid, branchId } = await requireBranch();
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfDay(addDays(now, -6));
  const monthStart = startOfDay(addDays(now, -29));

  const todayMatch = { tenant: tid, branch: branchId, createdAt: { $gte: todayStart, $lte: todayEnd } };
  const day = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } };
  const [today, todayCash, todayReturns, todayExpenses, week, weekReturns, topProducts, receivable, payable, lowStock, expiring, recent] = await Promise.all([
    Sale.aggregate([
      { $match: todayMatch },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          tax: { $sum: "$tax" },
          cost: { $sum: "$costTotal" },
          count: { $sum: 1 },
          credit: { $sum: "$creditAmount" },
        },
      },
    ]),
    Sale.aggregate([
      { $match: todayMatch },
      { $project: { pay: PAYMENTS_EXPR } },
      { $unwind: "$pay" },
      { $match: { "pay.method": "cash" } },
      { $group: { _id: null, total: { $sum: "$pay.amount" } } },
    ]),
    SaleReturn.aggregate([
      { $match: todayMatch },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          tax: { $sum: "$tax" },
          cost: { $sum: "$costTotal" },
          credit: { $sum: "$creditReduced" },
          cashRefund: { $sum: { $cond: [{ $eq: ["$refundMethod", "cash"] }, "$refund", 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      { $match: { tenant: tid, branch: branchId, date: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Sale.aggregate([
      { $match: { tenant: tid, branch: branchId, createdAt: { $gte: weekStart, $lte: todayEnd } } },
      { $group: { _id: day, total: { $sum: "$total" }, profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } } } },
    ]),
    SaleReturn.aggregate([
      { $match: { tenant: tid, branch: branchId, createdAt: { $gte: weekStart, $lte: todayEnd } } },
      { $group: { _id: day, total: { $sum: "$total" }, profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } } } },
    ]),
    Sale.aggregate([
      { $match: { tenant: tid, branch: branchId, createdAt: { $gte: monthStart } } },
      { $unwind: "$items" },
      {
        $project: {
          name: "$items.name",
          unit: "$items.unit",
          kept: { $subtract: ["$items.qty", { $ifNull: ["$items.returnedQty", 0] }] },
          total: { $cond: [{ $gt: ["$items.qty", 0] }, { $multiply: ["$items.total", { $divide: [{ $subtract: ["$items.qty", { $ifNull: ["$items.returnedQty", 0] }] }, "$items.qty"] }] }, 0] },
        },
      },
      { $match: { kept: { $gt: 0 } } },
      { $group: { _id: "$name", qty: { $sum: "$kept" }, total: { $sum: "$total" }, unit: { $first: "$unit" } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
    Party.aggregate([
      { $match: { tenant: tid, type: "customer", balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$balance" }, count: { $sum: 1 } } },
    ]),
    Party.aggregate([
      { $match: { tenant: tid, type: "supplier", balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$balance" }, count: { $sum: 1 } } },
    ]),
    Product.find({ tenant: tid, active: true }).select("name unit lowStockAlert").lean(),
    Product.countDocuments({ tenant: tid, active: true, expiryDate: { $ne: null, $lte: addDays(now, 7) } }),
    Sale.find({ tenant: tid, branch: branchId }).sort({ createdAt: -1 }).limit(6).select("invoiceNo total paymentMethod customerName createdAt status fbrStatus").lean(),
  ]);

  // Fill missing days so the chart always shows 7 bars.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const series = Array.from({ length: 7 }, (_, i) => {
    const key = fmt.format(addDays(weekStart, i));
    const row = week.find((w) => w._id === key);
    const ret = weekReturns.find((w) => w._id === key);
    return { date: key, total: round2((row?.total ?? 0) - (ret?.total ?? 0)), profit: round2((row?.profit ?? 0) - (ret?.profit ?? 0)) };
  });

  const s = today[0] ?? { total: 0, tax: 0, cost: 0, count: 0, credit: 0 };
  const r = todayReturns[0] ?? { total: 0, tax: 0, cost: 0, credit: 0, cashRefund: 0, count: 0 };
  // Today's figures are net of returns made today.
  const t = {
    total: s.total - r.total,
    tax: s.tax - r.tax,
    cost: s.cost - r.cost,
    count: s.count,
    cash: (todayCash[0]?.total ?? 0) - r.cashRefund,
    credit: s.credit - r.credit,
    returns: r.total,
    returnCount: r.count,
  };
  // Low stock is per branch: compare each product's stock here with its alert level.
  const levels = await branchStock(tid, branchId);
  const low = lowStock
    .map((p) => ({ ...p, stock: levels.get(String(p._id)) ?? 0 }))
    .filter((p) => p.stock <= p.lowStockAlert)
    .sort((x, y) => x.stock - y.stock);
  const lowStockCount = low.length;
  return {
    today: {
      sales: round2(t.total),
      bills: t.count,
      profit: round2(t.total - t.tax - t.cost),
      cash: round2(t.cash),
      credit: round2(t.credit),
      expenses: round2(todayExpenses[0]?.total ?? 0),
      returns: round2(t.returns),
      returnCount: t.returnCount,
    },
    receivable: { total: round2(receivable[0]?.total ?? 0), count: receivable[0]?.count ?? 0 },
    payable: { total: round2(payable[0]?.total ?? 0), count: payable[0]?.count ?? 0 },
    lowStock: low.slice(0, 8),
    lowStockCount,
    expiringCount: expiring,
    series,
    topProducts,
    recent,
  };
});
