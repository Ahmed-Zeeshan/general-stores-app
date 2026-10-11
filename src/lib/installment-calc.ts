/** Installment (qist) arithmetic shared by the server and the pages (no database code). */
import { round2 } from "./money";

export type ScheduleRow = { no: number; dueDate: string | Date; amount: number };

/** Markup on what is financed (cash price − advance): a percentage or a fixed amount. */
export function markupOf(type: "percent" | "amount", value: number, base: number) {
  return round2(type === "percent" ? (Math.max(0, base) * value) / 100 : value);
}

/**
 * Monthly schedule in whole rupees: every month the same, the last one takes what is left so the
 * schedule adds up exactly to `financed`. Due dates are `firstDue` and then the same day each month.
 */
export function buildSchedule(financed: number, months: number, firstDue: Date): ScheduleRow[] {
  const each = Math.floor(financed / months);
  const rows: ScheduleRow[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(firstDue);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    // 31st → last day of shorter months.
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    rows.push({ no: i + 1, dueDate: d, amount: i === months - 1 ? round2(financed - each * (months - 1)) : each });
  }
  return rows;
}

export type RowState = ScheduleRow & { paid: number; left: number; state: "paid" | "part" | "due" | "late" };

/** Matches the money paid to the months, oldest first, and works out what is late. */
export function planState(p: { schedule: ScheduleRow[]; paid: number; financed: number; writtenOff?: number; status?: string }, now = new Date()) {
  let money = round2(p.paid);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const rows: RowState[] = p.schedule.map((r) => {
    const paid = round2(Math.min(r.amount, Math.max(0, money)));
    money = round2(money - paid);
    const left = round2(r.amount - paid);
    const late = left > 0.004 && new Date(r.dueDate) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { ...r, paid, left, state: left <= 0.004 ? "paid" : late ? "late" : paid > 0 ? "part" : "due" };
  });
  const lateRows = rows.filter((r) => r.state === "late");
  const next = rows.find((r) => r.left > 0.004);
  const oldestLate = lateRows[0];
  return {
    rows,
    balance: round2(Math.max(0, p.financed - p.paid - (p.writtenOff ?? 0))),
    overdue: round2(lateRows.reduce((a, r) => a + r.left, 0)),
    lateCount: lateRows.length,
    daysLate: oldestLate ? Math.floor((endOfToday.getTime() - new Date(oldestLate.dueDate).getTime()) / 864e5) : 0,
    next: next ? { no: next.no, dueDate: next.dueDate, amount: next.left } : null,
    dueToday: rows.some((r) => r.left > 0.004 && new Date(r.dueDate).toDateString() === now.toDateString()),
  };
}
