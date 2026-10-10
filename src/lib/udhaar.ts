import type { Types } from "mongoose";
import { round2 } from "./money";
import { LedgerEntry, Party, Reminder } from "@/models";

export type AgingRow = {
  _id: Types.ObjectId;
  name: string;
  phone?: string | null;
  balance: number;
  creditLimit: number;
  buckets: { d0_30: number; d31_60: number; d61_90: number; d90: number };
  oldestDueAt: Date | null;
  daysOverdue: number;
  lastPaymentAt: Date | null;
  lastPurchaseAt: Date | null;
  lastRemindedAt: Date | null;
  reminders: number;
};

const DAY = 864e5;

/**
 * Udhaar ageing per customer. Payments clear the oldest charges first (FIFO), so what is left
 * shows how long each part of the balance has been unpaid.
 */
export async function udhaarReport(tid: Types.ObjectId, now = new Date()): Promise<AgingRow[]> {
  const customers = await Party.find({ tenant: tid, type: "customer", active: true, balance: { $gt: 0 } })
    .select("name phone balance creditLimit")
    .lean();
  if (!customers.length) return [];
  const ids = customers.map((c) => c._id);
  const [entries, reminders] = await Promise.all([
    LedgerEntry.find({ tenant: tid, party: { $in: ids } }).sort({ createdAt: 1, _id: 1 }).select("party amount kind createdAt").lean(),
    Reminder.aggregate([
      { $match: { tenant: tid, party: { $in: ids } } },
      { $group: { _id: "$party", last: { $max: "$createdAt" }, count: { $sum: 1 } } },
    ]),
  ]);
  const byParty = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = String(e.party);
    if (!byParty.has(k)) byParty.set(k, []);
    byParty.get(k)!.push(e);
  }
  const reminded = new Map(reminders.map((r) => [String(r._id), r]));

  return customers
    .map((c) => {
      const list = byParty.get(String(c._id)) ?? [];
      const open: { at: Date; left: number }[] = [];
      let lastPaymentAt: Date | null = null;
      let lastPurchaseAt: Date | null = null;
      for (const e of list) {
        if (e.kind === "payment") lastPaymentAt = e.createdAt;
        if (e.kind === "sale") lastPurchaseAt = e.createdAt;
        if (e.amount > 0) open.push({ at: e.createdAt, left: e.amount });
        else {
          let credit = -e.amount;
          for (const o of open) {
            if (credit <= 0) break;
            const used = Math.min(o.left, credit);
            o.left -= used;
            credit -= used;
          }
        }
      }
      const due = open.filter((o) => o.left > 0.004);
      // Keep the report consistent with the khata balance even if old entries were edited by hand.
      const diff = round2(c.balance - due.reduce((s, o) => s + o.left, 0));
      if (Math.abs(diff) >= 0.01) {
        if (diff > 0 || !due.length) due.push({ at: now, left: Math.max(0, diff) });
        else due[due.length - 1].left = Math.max(0, due[due.length - 1].left + diff);
      }
      const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
      for (const o of due) {
        const age = (now.getTime() - new Date(o.at).getTime()) / DAY;
        if (age <= 30) buckets.d0_30 += o.left;
        else if (age <= 60) buckets.d31_60 += o.left;
        else if (age <= 90) buckets.d61_90 += o.left;
        else buckets.d90 += o.left;
      }
      const oldest = due.find((o) => o.left > 0.004)?.at ?? null;
      const r = reminded.get(String(c._id));
      return {
        _id: c._id,
        name: c.name,
        phone: c.phone,
        balance: round2(c.balance),
        creditLimit: c.creditLimit ?? 0,
        buckets: { d0_30: round2(buckets.d0_30), d31_60: round2(buckets.d31_60), d61_90: round2(buckets.d61_90), d90: round2(buckets.d90) },
        oldestDueAt: oldest,
        daysOverdue: oldest ? Math.floor((now.getTime() - new Date(oldest).getTime()) / DAY) : 0,
        lastPaymentAt,
        lastPurchaseAt,
        lastRemindedAt: r?.last ?? null,
        reminders: r?.count ?? 0,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
}

/** Khata statement for one customer/supplier between two dates. */
export async function statement(tid: Types.ObjectId, partyId: string, from: Date, to: Date) {
  const party = await Party.findOne({ _id: partyId, tenant: tid }).lean();
  if (!party) return null;
  const [before, entries] = await Promise.all([
    LedgerEntry.aggregate([
      { $match: { tenant: tid, party: party._id, createdAt: { $lt: from } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    LedgerEntry.find({ tenant: tid, party: party._id, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: 1, _id: 1 }).lean(),
  ]);
  const opening = round2(before[0]?.total ?? 0);
  let running = opening;
  const rows = entries.map((e) => {
    running = round2(running + e.amount);
    return { _id: e._id, date: e.createdAt, kind: e.kind, refNo: e.refNo, note: e.note, method: e.method, amount: e.amount, balance: running };
  });
  const charges = round2(entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0));
  const payments = round2(-entries.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0));
  return { party, from, to, opening, charges, payments, closing: running, rows };
}
