import { addDays, endOfDay, handle, startOfDay, TIMEZONE } from "@/lib/api";
import { branchStock, requireBranch } from "@/lib/branches";
import { round2 } from "@/lib/money";
import { Expense, Party, Product, Sale } from "@/models";

export const GET = handle(async () => {
  const { tid, branchId } = await requireBranch();
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfDay(addDays(now, -6));
  const monthStart = startOfDay(addDays(now, -29));

  const [today, todayExpenses, week, topProducts, receivable, payable, lowStock, expiring, recent] = await Promise.all([
    Sale.aggregate([
      { $match: { tenant: tid, branch: branchId, status: "completed", createdAt: { $gte: todayStart, $lte: todayEnd } } },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" },
          tax: { $sum: "$tax" },
          cost: { $sum: "$costTotal" },
          count: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ["$paymentMethod", "cash"] }, "$amountPaid", 0] } },
          credit: { $sum: "$creditAmount" },
        },
      },
    ]),
    Expense.aggregate([
      { $match: { tenant: tid, branch: branchId, date: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Sale.aggregate([
      { $match: { tenant: tid, branch: branchId, status: "completed", createdAt: { $gte: weekStart, $lte: todayEnd } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } },
          total: { $sum: "$total" },
          profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Sale.aggregate([
      { $match: { tenant: tid, branch: branchId, status: "completed", createdAt: { $gte: monthStart } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", qty: { $sum: "$items.qty" }, total: { $sum: "$items.total" }, unit: { $first: "$items.unit" } } },
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
    return { date: key, total: round2(row?.total ?? 0), profit: round2(row?.profit ?? 0) };
  });

  const t = today[0] ?? { total: 0, tax: 0, cost: 0, count: 0, cash: 0, credit: 0 };
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
