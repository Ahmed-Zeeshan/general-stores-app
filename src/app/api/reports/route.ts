import { dateRange, handle, requireUser, TIMEZONE } from "@/lib/api";
import { round2 } from "@/lib/money";
import { Expense, Purchase, Sale } from "@/models";

export const GET = handle(async (req) => {
  await requireUser(["owner", "manager"]);
  const { from, to } = dateRange(new URL(req.url), 6);
  const match = { status: "completed", createdAt: { $gte: from, $lte: to } };

  const [summary, byMethod, byDay, topItems, expenses, purchases, returns] = await Promise.all([
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
      { $group: { _id: "$paymentMethod", total: { $sum: "$total" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } },
          total: { $sum: "$total" },
          profit: { $sum: { $subtract: [{ $subtract: ["$total", "$tax"] }, "$costTotal"] } },
          bills: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Sale.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          unit: { $first: "$items.unit" },
          qty: { $sum: "$items.qty" },
          total: { $sum: "$items.total" },
          profit: { $sum: { $subtract: ["$items.total", { $multiply: ["$items.qty", "$items.cost"] }] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]),
    Expense.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ]),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { status: "returned", returnedAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
  ]);

  const s = summary[0] ?? { bills: 0, subtotal: 0, discount: 0, tax: 0, total: 0, cost: 0, credit: 0 };
  const grossProfit = round2(s.total - s.tax - s.cost);
  const expenseTotal = round2(expenses.reduce((a, e) => a + e.total, 0));
  return {
    from,
    to,
    summary: {
      bills: s.bills,
      grossSales: round2(s.subtotal),
      discount: round2(s.discount),
      tax: round2(s.tax),
      netSales: round2(s.total),
      cost: round2(s.cost),
      grossProfit,
      expenses: expenseTotal,
      netProfit: round2(grossProfit - expenseTotal),
      credit: round2(s.credit),
      avgBill: s.bills ? round2(s.total / s.bills) : 0,
      purchases: round2(purchases[0]?.total ?? 0),
      returns: round2(returns[0]?.total ?? 0),
      returnCount: returns[0]?.count ?? 0,
    },
    byMethod,
    byDay: byDay.map((d) => ({ date: d._id, total: round2(d.total), profit: round2(d.profit), bills: d.bills })),
    topItems: topItems.map((t) => ({ ...t, total: round2(t.total), profit: round2(t.profit) })),
    expenses,
  };
});
