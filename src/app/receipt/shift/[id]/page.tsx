"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";

type Money = { method: string; total: number; count: number };
type Summary = {
  bills: number;
  firstBill?: string;
  lastBill?: string;
  avgBill?: number;
  byCashier?: { name: string; bills: number; total: number }[];
  sales: number;
  discount: number;
  tax: number;
  salesByMethod: Money[];
  returns: number;
  returnCount: number;
  refundsByMethod: Money[];
  udhaarCollectedByMethod: Money[];
  supplierPaymentsByMethod: Money[];
  purchasesPaid: number;
  expensesCash: number;
  expensesOther: number;
  expectedCash: number;
  cashFlow: { label: string; amount: number }[];
};
type Shift = {
  shiftNo: string;
  branchName?: string;
  status: "open" | "closed";
  openedAt: string;
  openedByName?: string;
  closedAt?: string;
  closedByName?: string;
  movements: { kind: string; amount: number; reason?: string }[];
  denominations?: { value: number; count: number }[];
  countedCash?: number;
  expectedCash?: number;
  difference?: number;
  closeNote?: string;
  openingCash: number;
  expectedOpening?: number;
  openingDifference?: number;
  floatLeft?: number;
  removedAtClose?: number;
  late?: { kind: "sale" | "return"; no: string; at: string; total: number; cash: number }[];
  summary: Summary | null;
};
type Settings = { shopName: string; phone?: string; address?: string };

const label = (m: string) => (m === "credit" ? "Udhaar given" : m === "khata" ? "To khata" : (PAYMENT_LABELS[m] ?? m));

export default function ShiftReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <ShiftReport id={id} />
    </Suspense>
  );
}

function ShiftReport({ id }: { id: string }) {
  const search = useSearchParams();
  const [shift, setShift] = useState<Shift | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<Shift>(`/api/shifts/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([s, me]) => {
        setShift(s);
        setSettings(me.settings);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (shift && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [shift, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!shift || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const s = shift.summary;
  if (!s) return <p className="p-10 text-center text-slate-500">The report is available after the day is closed.</p>;
  const closed = shift.status === "closed";
  const Line = ({ l, v, bold }: { l: string; v: number | string; bold?: boolean }) => (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{l}</span>
      <span className="shrink-0">{typeof v === "number" ? (v < 0 ? `−${formatPKR(-v)}` : formatPKR(v)) : v}</span>
    </div>
  );
  const Hr = () => <div className="my-2 border-t border-dashed border-black" />;
  const Section = ({ title }: { title: string }) => <div className="mt-1 font-bold uppercase">{title}</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[320px] justify-center gap-2">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print
        </button>
        <button onClick={() => window.close()} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm">Close</button>
      </div>
      <div className="mx-auto w-[300px] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none">
        <div className="text-center">
          <div className="text-base font-bold uppercase">{settings.shopName}</div>
          {shift.branchName && <div>{shift.branchName}</div>}
        </div>
        <Hr />
        <div className="text-center text-sm font-bold">{closed ? "Z REPORT — DAY CLOSE" : "X REPORT — DAY NOT CLOSED"}</div>
        <div>Shift: {shift.shiftNo}</div>
        <div>Opened: {formatDate(shift.openedAt, true)}{shift.openedByName ? ` · ${shift.openedByName}` : ""}</div>
        {closed ? (
          <div>Closed: {formatDate(shift.closedAt!, true)}{shift.closedByName ? ` · ${shift.closedByName}` : ""}</div>
        ) : (
          <div>Printed: {formatDate(new Date().toISOString(), true)}</div>
        )}
        <Hr />
        {shift.openingDifference !== undefined && (
          <>
            <div>Last close left: {formatPKR(shift.expectedOpening ?? 0)}</div>
            <div className="font-bold">
              Opening count {shift.openingDifference < 0 ? `SHORT ${formatPKR(-shift.openingDifference)}` : `OVER ${formatPKR(shift.openingDifference)}`}
            </div>
            <Hr />
          </>
        )}
        <Section title="Sales" />
        <Line l="Bills" v={String(s.bills)} />
        {s.firstBill && <Line l="Bill numbers" v={s.firstBill === s.lastBill ? s.firstBill : `${s.firstBill} – ${s.lastBill}`} />}
        {s.bills > 0 && s.avgBill !== undefined && <Line l="Average bill" v={s.avgBill} />}
        <Line l="Sales" v={s.sales} />
        {s.discount > 0 && <Line l="Discounts given" v={s.discount} />}
        {s.returns > 0 && <Line l={`Returns (${s.returnCount})`} v={-s.returns} />}
        <Line l="Net sales" v={s.sales - s.returns} bold />
        {s.tax > 0 && <Line l="Sales tax in sales" v={s.tax} />}
        {(s.byCashier?.length ?? 0) > 1 && (
          <>
            <Hr />
            <Section title="By cashier" />
            {s.byCashier!.map((c) => <Line key={c.name} l={`${c.name} (${c.bills})`} v={c.total} />)}
          </>
        )}
        <Hr />
        <Section title="Money taken for bills" />
        {s.salesByMethod.length ? s.salesByMethod.map((m) => <Line key={m.method} l={`${label(m.method)} (${m.count})`} v={m.total} />) : <div>—</div>}
        {s.udhaarCollectedByMethod.length > 0 && (
          <>
            <Hr />
            <Section title="Old udhaar collected" />
            {s.udhaarCollectedByMethod.map((m) => <Line key={m.method} l={`${label(m.method)} (${m.count})`} v={m.total} />)}
          </>
        )}
        {s.refundsByMethod.length > 0 && (
          <>
            <Hr />
            <Section title="Refunds on returns" />
            {s.refundsByMethod.map((m) => <Line key={m.method} l={`${label(m.method)} (${m.count})`} v={-m.total} />)}
          </>
        )}
        {(s.expensesCash > 0 || s.expensesOther > 0 || s.purchasesPaid > 0 || s.supplierPaymentsByMethod.length > 0) && (
          <>
            <Hr />
            <Section title="Money paid out" />
            {s.expensesCash > 0 && <Line l="Expenses (cash)" v={s.expensesCash} />}
            {s.expensesOther > 0 && <Line l="Expenses (bank/other)" v={s.expensesOther} />}
            {s.purchasesPaid > 0 && <Line l="Purchases paid" v={s.purchasesPaid} />}
            {s.supplierPaymentsByMethod.map((m) => <Line key={m.method} l={`Suppliers — ${label(m.method)}`} v={m.total} />)}
          </>
        )}
        {shift.movements.length > 0 && (
          <>
            <Hr />
            <Section title="Cash in / out" />
            {shift.movements.map((m, i) => (
              <Line key={i} l={m.reason ?? (m.kind === "in" ? "Cash in" : "Cash out")} v={m.kind === "in" ? m.amount : -m.amount} />
            ))}
          </>
        )}
        <Hr />
        <Section title="Cash drawer" />
        {s.cashFlow.filter((x) => x.label === "Opening cash" || Math.abs(x.amount) > 0.004).map((x) => <Line key={x.label} l={x.label} v={x.amount} />)}
        <div className="mt-1 border-t border-black pt-1">
          <Line l="SHOULD BE IN DRAWER" v={closed ? shift.expectedCash ?? s.expectedCash : s.expectedCash} bold />
        </div>
        {closed && (
          <>
            <Line l="COUNTED" v={shift.countedCash ?? 0} bold />
            <div className="mt-1 text-center text-sm font-bold">
              {Math.abs(shift.difference ?? 0) < 0.5 ? "CASH MATCHES ✓" : (shift.difference ?? 0) < 0 ? `SHORT ${formatPKR(-(shift.difference ?? 0))}` : `OVER ${formatPKR(shift.difference ?? 0)}`}
            </div>
            {shift.denominations && shift.denominations.length > 0 && (
              <>
                <Hr />
                <Section title="Cash count" />
                {shift.denominations.map((d) =>
                  d.value === 0 ? <Line key="coins" l="Coins" v={d.count} /> : <Line key={d.value} l={`${d.value.toLocaleString("en-PK")} × ${d.count}`} v={d.value * d.count} />,
                )}
              </>
            )}
            {shift.closeNote && <div className="mt-1">Note: {shift.closeNote}</div>}
            {shift.floatLeft !== undefined && (
              <>
                <Hr />
                <Section title="After the count" />
                <Line l="Kept in drawer (float)" v={shift.floatLeft} />
                {(shift.removedAtClose ?? 0) > 0 && <Line l="Taken out (bank / owner)" v={shift.removedAtClose!} />}
              </>
            )}
            {(shift.late?.length ?? 0) > 0 && (() => {
              // Bills made offline during this day that reached the server after the close.
              const lateCash = shift.late!.reduce((a, x) => a + (x.kind === "sale" ? x.cash : -x.cash), 0);
              const adjusted = (shift.difference ?? 0) - lateCash;
              return (
                <>
                  <Hr />
                  <Section title="Arrived after the close (made offline)" />
                  {shift.late!.map((x) => (
                    <Line key={x.no} l={`${x.no} · ${formatDate(x.at, true)}`} v={x.kind === "sale" ? x.cash : -x.cash} />
                  ))}
                  <Line l="Should have been in drawer" v={(shift.expectedCash ?? 0) + lateCash} bold />
                  <div className="mt-1 text-center text-sm font-bold">
                    {Math.abs(adjusted) < 0.5 ? "WITH THESE: CASH MATCHES ✓" : adjusted < 0 ? `WITH THESE: SHORT ${formatPKR(-adjusted)}` : `WITH THESE: OVER ${formatPKR(adjusted)}`}
                  </div>
                </>
              );
            })()}
          </>
        )}
        <Hr />
        <div className="mt-6 flex justify-between gap-4 text-[11px]">
          <div className="flex-1 border-t border-black pt-1 text-center">Cashier</div>
          <div className="flex-1 border-t border-black pt-1 text-center">Owner / Manager</div>
        </div>
      </div>
    </div>
  );
}
