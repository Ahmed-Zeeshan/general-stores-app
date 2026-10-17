import type { Types } from "mongoose";
import { round2 } from "./money";
import { OPEN } from "./repairs";
import { withState, type PlanLean } from "./installments";
import { InstallmentPlan, Repair, SaleReturn, UsedPurchase, Wallet, WalletTxn } from "@/models";

type Modules = Partial<Record<"phones" | "repairs" | "wallets" | "installments", boolean>>;

/**
 * Mobile-shop figures for a period: repairs delivered and their profit, Easyload / wallet profit,
 * used phones bought and installments sold and collected. Only the features the shop uses are
 * worked out. `branch` null = all branches.
 */
export async function mobileReport(tid: Types.ObjectId, branch: Types.ObjectId | null, from: Date, to: Date, modules: Modules, now = new Date()) {
  const b = branch ? { branch } : {};
  const inRange = { $gte: from, $lte: to };
  const [repairs, wallets, usedPhones, installments] = await Promise.all([
    modules.repairs ? repairFigures() : null,
    modules.wallets ? walletFigures() : null,
    modules.phones ? usedFigures() : null,
    modules.installments ? installmentFigures() : null,
  ]);
  return { repairs, wallets, usedPhones, installments };

  async function repairFigures() {
    const [delivered, collected, open] = await Promise.all([
      Repair.aggregate([
        { $match: { tenant: tid, ...b, status: "delivered", deliveredAt: inRange } },
        {
          $project: {
            total: 1,
            partsCost: { $sum: { $map: { input: { $ifNull: ["$parts", []] }, as: "p", in: { $multiply: [{ $ifNull: ["$$p.cost", 0] }, "$$p.qty"] } } } },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, income: { $sum: "$total" }, partsCost: { $sum: "$partsCost" } } },
      ]),
      Repair.aggregate([
        { $match: { tenant: tid, ...b, "payments.at": inRange } },
        { $unwind: "$payments" },
        { $match: { "payments.at": inRange } },
        { $group: { _id: null, total: { $sum: "$payments.amount" } } },
      ]),
      Repair.find({ tenant: tid, ...b, status: { $in: OPEN } })
        .select("status promisedAt")
        .lean(),
    ]);
    const d = delivered[0] ?? { count: 0, income: 0, partsCost: 0 };
    return {
      delivered: d.count,
      income: round2(d.income),
      partsCost: round2(d.partsCost),
      profit: round2(d.income - d.partsCost),
      collected: round2(collected[0]?.total ?? 0),
      inShop: open.length,
      ready: open.filter((j) => j.status === "ready").length,
      late: open.filter((j) => j.promisedAt && j.promisedAt < now && j.status !== "ready").length,
    };
  }

  async function walletFigures() {
    const [byType, accounts] = await Promise.all([
      WalletTxn.aggregate([
        { $match: { tenant: tid, ...b, createdAt: inRange } },
        // A cancelled entry counts against the type it cancelled.
        { $lookup: { from: "wallettxns", localField: "reverses", foreignField: "_id", as: "orig", pipeline: [{ $match: { tenant: tid } }, { $project: { type: 1 } }] } },
        {
          $group: {
            _id: { $cond: [{ $eq: ["$type", "reversal"] }, { $ifNull: [{ $first: "$orig.type" }, "reversal"] }, "$type"] },
            count: { $sum: { $cond: [{ $eq: ["$type", "reversal"] }, -1, 1] } },
            amount: { $sum: { $cond: [{ $eq: ["$type", "reversal"] }, { $multiply: ["$amount", -1] }, "$amount"] } },
            profit: { $sum: { $add: [{ $ifNull: ["$fee", 0] }, { $ifNull: ["$commission", 0] }] } },
          },
        },
      ]),
      Wallet.find({ tenant: tid, ...b, active: true }).select("name balance lowAlert provider kind").sort({ name: 1 }).lean(),
    ]);
    const service = byType.filter((t) => ["load", "package", "cash_in", "cash_out", "bill"].includes(t._id));
    return {
      count: service.reduce((a, t) => a + t.count, 0),
      profit: round2(byType.reduce((a, t) => a + t.profit, 0)),
      byType: byType
        .filter((t) => t._id !== "adjust" && (t.count || t.amount || t.profit))
        .map((t) => ({ type: String(t._id), count: t.count, amount: round2(t.amount), profit: round2(t.profit) }))
        .sort((x, y) => y.profit - x.profit),
      balance: round2(accounts.reduce((a, w) => a + (w.balance ?? 0), 0)),
      low: accounts.filter((w) => (w.lowAlert ?? 0) > 0 && (w.balance ?? 0) < (w.lowAlert ?? 0)).map((w) => ({ _id: String(w._id), name: w.name, balance: round2(w.balance ?? 0), lowAlert: w.lowAlert ?? 0 })),
    };
  }

  async function usedFigures() {
    const r = await UsedPurchase.aggregate([
      { $match: { tenant: tid, ...b, status: "completed", createdAt: inRange } },
      { $group: { _id: null, count: { $sum: 1 }, spent: { $sum: "$price" } } },
    ]);
    return { count: r[0]?.count ?? 0, spent: round2(r[0]?.spent ?? 0) };
  }

  async function installmentFigures() {
    const [sold, collected, active, closed] = await Promise.all([
      InstallmentPlan.aggregate([
        { $match: { tenant: tid, ...b, createdAt: inRange } },
        { $group: { _id: null, count: { $sum: 1 }, cashPrice: { $sum: "$cashPrice" }, financed: { $sum: "$financed" }, markup: { $sum: "$markup" } } },
      ]),
      InstallmentPlan.aggregate([
        { $match: { tenant: tid, ...b, "payments.at": inRange } },
        { $unwind: "$payments" },
        { $match: { "payments.at": inRange } },
        { $group: { _id: null, total: { $sum: "$payments.amount" } } },
      ]),
      InstallmentPlan.find({ tenant: tid, ...b, status: "active" }).select("-payments").lean(),
      // Plans closed early in the period: what was written off, given back and taken back.
      InstallmentPlan.find({ tenant: tid, ...b, status: "cancelled", cancelledAt: inRange }).select("writtenOff payments sale planNo").lean(),
    ]);
    const writtenOff = round2(closed.reduce((a, p) => a + (p.writtenOff ?? 0), 0));
    const refunded = round2(closed.reduce((a, p) => a + (p.payments ?? []).filter((x) => x.kind === "refund").reduce((x, r) => x + Math.abs(r.amount), 0), 0));
    // Goods taken back are a return of the bill (its sale is reversed in the sales figures).
    const takenBack = closed.length
      ? round2(
          (await SaleReturn.find({ tenant: tid, sale: { $in: closed.map((p) => p.sale) }, reason: /^Taken back on installment plan/ }).select("total").lean()).reduce((a, r) => a + r.total, 0),
        )
      : 0;
    const states = (active as unknown as PlanLean[]).map((p) => withState(p, now));
    const s = sold[0] ?? { count: 0, cashPrice: 0, financed: 0, markup: 0 };
    return {
      sold: s.count,
      soldValue: round2(s.cashPrice),
      markup: round2(s.markup),
      writtenOff,
      refunded,
      takenBack,
      /**
       * Installment income for the profit report: markup on plans sold, less balances written off and
       * money given back on closing; goods taken back add back the bill value their return took off.
       */
      profit: round2(s.markup - writtenOff - refunded + takenBack),
      collected: round2(collected[0]?.total ?? 0),
      running: states.length,
      outstanding: round2(states.reduce((a, p) => a + p.balance, 0)),
      overdue: round2(states.reduce((a, p) => a + p.overdue, 0)),
      latePlans: states.filter((p) => p.lateCount > 0).length,
    };
  }
}

export type MobileReport = Awaited<ReturnType<typeof mobileReport>>;
