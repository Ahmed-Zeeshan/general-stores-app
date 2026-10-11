"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import type { PlanRow } from "@/components/installments";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR, round2 } from "@/lib/money";
import { rupeesInWords } from "@/lib/words";

type Settings = { shopName: string; phone?: string; address?: string };

export default function InstallmentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <InstallmentDoc id={id} />
    </Suspense>
  );
}

function InstallmentDoc({ id }: { id: string }) {
  const search = useSearchParams();
  const receipt = search.get("receipt");
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<PlanRow>(`/api/installments/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([p, me]) => {
        setPlan(p);
        setSettings(me.settings);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (plan && search.get("print") === "1") setTimeout(() => window.print(), 400);
  }, [plan, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!plan || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  if (receipt) return <PaymentSlip plan={plan} settings={settings} receiptNo={receipt} />;
  return <Agreement plan={plan} settings={settings} />;
}

/** 80 mm slip for one installment received. */
function PaymentSlip({ plan, settings, receiptNo }: { plan: PlanRow; settings: Settings; receiptNo: string }) {
  const payments = plan.payments ?? [];
  const i = payments.findIndex((p) => p.receiptNo === receiptNo);
  if (i < 0) return <p className="p-10 text-center text-rose-600">Receipt {receiptNo} not found on {plan.planNo}.</p>;
  const pay = payments[i];
  // What was left before and after this payment (cancelled payments are taken out by their reversal lines).
  const before = round2(plan.financed - payments.slice(0, i).reduce((a, x) => a + x.amount, 0));
  const after = round2(before - pay.amount);
  const line = (label: string, value: string, bold = false) => (
    <div className={`flex justify-between gap-2 ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[360px] justify-center gap-2">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print
        </button>
        <button onClick={() => window.close()} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm">
          Close
        </button>
      </div>
      <div className="relative mx-auto w-[300px] overflow-hidden bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none">
        {pay.reversed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 rounded border-4 border-black/60 px-3 py-1 text-3xl font-black tracking-widest text-black/60">CANCELLED</span>
          </div>
        )}
        <div className="text-center">
          <div className="text-base font-bold uppercase">{settings.shopName}</div>
          {settings.address && <div>{settings.address}</div>}
          {settings.phone && <div>Ph: {settings.phone}</div>}
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-sm font-bold">INSTALLMENT RECEIPT</div>
        <div className="text-center" dir="rtl">
          قسط وصولی رسید
        </div>
        <div className="mt-1">Receipt: {pay.receiptNo}</div>
        <div>{formatDate(pay.at, true)}</div>
        <div>Plan: {plan.planNo} · Bill {plan.invoiceNo}</div>
        <div>Customer: {plan.customerName}</div>
        {plan.customerPhone && <div>Phone: {plan.customerPhone}</div>}
        <div className="mt-1 break-words">{plan.itemsText}</div>
        <div className="my-2 border-t border-dashed border-black" />
        {line("Left before", formatPKR(before))}
        {line("RECEIVED", formatPKR(pay.amount), true)}
        {line("Paid by", `${PAYMENT_LABELS[pay.method] ?? pay.method}${pay.ref ? ` · ${pay.ref}` : ""}`)}
        <div className="my-2 border-t border-dashed border-black" />
        {line("LEFT TO PAY", formatPKR(Math.max(0, after)), true)}
        {after <= 0.004 && <div className="mt-1 text-center font-bold">ALL INSTALLMENTS PAID</div>}
        {pay.userName && <div className="mt-1">Received by: {pay.userName}</div>}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="mt-6 flex justify-between gap-4 text-[11px]">
          <div className="flex-1 border-t border-black pt-1 text-center">Customer</div>
          <div className="flex-1 border-t border-black pt-1 text-center">Shop</div>
        </div>
        <div className="mt-3 text-center">Shukriya! / شکریہ</div>
      </div>
    </div>
  );
}

/** A4 installment agreement with the schedule, guarantor and signatures. */
function Agreement({ plan, settings }: { plan: PlanRow; settings: Settings }) {
  const row = (label: string, value?: React.ReactNode) =>
    value ? (
      <div className="flex gap-3 border-b border-slate-200 py-1.5">
        <span className="w-40 shrink-0 text-slate-500">{label}</span>
        <span className="min-w-0 font-medium break-words">{value}</span>
      </div>
    ) : null;
  const perMonth = plan.schedule[0]?.amount ?? 0;
  const g = plan.guarantor;
  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-4">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print agreement
        </button>
      </div>
      <div className="mx-auto max-w-3xl bg-white p-5 text-[13px] text-slate-900 shadow-lg sm:p-10 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex flex-col gap-2 border-b-2 border-slate-900 pb-3 sm:flex-row sm:items-start sm:justify-between print:flex-row">
          <div>
            <div className="text-xl font-extrabold sm:text-2xl">{settings.shopName}</div>
            {settings.address && <div className="text-slate-600">{settings.address}</div>}
            {settings.phone && <div className="text-slate-600">Phone: {settings.phone}</div>}
          </div>
          <div className="sm:text-right print:text-right">
            <div className="text-base font-bold uppercase">Installment Sale Agreement</div>
            <div className="urdu text-slate-500">اقساط پر فروخت کا اقرار نامہ</div>
            <div className="text-slate-600">
              {plan.planNo} · Bill {plan.invoiceNo} · {formatDate(plan.createdAt)}
            </div>
          </div>
        </div>
        {plan.status === "cancelled" && <div className="mt-3 rounded bg-rose-100 p-2 text-center font-bold text-rose-800">CLOSED — {plan.cancelReason}</div>}
        {plan.status === "completed" && <div className="mt-3 rounded bg-emerald-100 p-2 text-center font-bold text-emerald-800">ALL INSTALLMENTS PAID</div>}

        <h3 className="mt-5 font-bold uppercase text-slate-500">Buyer / خریدار</h3>
        {row("Name", plan.customerName)}
        {row("CNIC", plan.customerCnic)}
        {row("Mobile", plan.customerPhone)}
        {row("Address", plan.customerAddress)}

        {g?.name && (
          <>
            <h3 className="mt-5 font-bold uppercase text-slate-500">Guarantor / ضامن</h3>
            {row("Name", `${g.name}${g.relation ? ` (${g.relation})` : ""}`)}
            {row("CNIC", g.cnic)}
            {row("Mobile", g.phone)}
            {row("Address", g.address)}
          </>
        )}

        <h3 className="mt-5 font-bold uppercase text-slate-500">Goods & price / سامان اور قیمت</h3>
        {row("Goods", plan.itemsText)}
        {row("Cash price", formatPKR(plan.cashPrice))}
        {row("Advance paid", formatPKR(plan.advance))}
        {row("Markup", plan.markup ? `${formatPKR(plan.markup)}${plan.markupType === "percent" ? ` (${plan.markupValue}%)` : ""}` : "None")}
        {row("To pay in installments", <span className="text-base font-bold">{formatPKR(plan.financed)}</span>)}
        {row("In words", rupeesInWords(plan.financed))}
        {row("Installments", `${plan.months} monthly × ${formatPKR(perMonth)}`)}

        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="border border-slate-300 px-2 py-1">No.</th>
              <th className="border border-slate-300 px-2 py-1">Due date</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Amount</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Paid</th>
              <th className="border border-slate-300 px-2 py-1">Signature</th>
            </tr>
          </thead>
          <tbody>
            {(plan.rows ?? []).map((r) => (
              <tr key={r.no}>
                <td className="border border-slate-300 px-2 py-1">{r.no}</td>
                <td className="border border-slate-300 px-2 py-1">{formatDate(r.dueDate)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{formatPKR(r.amount)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{r.paid ? formatPKR(r.paid) : ""}</td>
                <td className="w-28 border border-slate-300 px-2 py-1" />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 rounded-lg border border-slate-300 p-3 leading-relaxed print:break-inside-avoid">
          <p>
            I, <b>{plan.customerName}</b>
            {plan.customerCnic && ` (CNIC ${plan.customerCnic})`}, have bought the goods above from {settings.shopName} on installments. I will pay {formatPKR(perMonth)} every month on the dates
            above until {formatPKR(plan.financed)} is paid in full. If I do not pay on time, the shop may take the goods back and the money already paid will not be returned.
            {g?.name && ` ${g.name} (CNIC ${g.cnic}) stands as my guarantor and will pay if I do not.`}
          </p>
          <p className="urdu mt-2 text-right">
            میں نے اوپر دیا گیا سامان قسطوں پر خریدا ہے۔ میں ہر ماہ مقررہ تاریخ پر قسط ادا کروں گا/گی۔ قسط وقت پر ادا نہ کرنے کی صورت میں دکان سامان واپس لے سکتی ہے اور ادا شدہ رقم واپس نہیں ہو گی۔
            {g?.name && " ضامن قسط ادا نہ ہونے کی صورت میں ادائیگی کا ذمہ دار ہو گا۔"}
          </p>
        </div>

        <div className={`mt-10 grid gap-6 text-center text-xs ${g?.name ? "grid-cols-4" : "grid-cols-3"} print:break-inside-avoid`}>
          <div>
            <div className="h-14 border-b border-slate-800" />
            Buyer signature / خریدار
          </div>
          <div>
            <div className="mx-auto h-14 w-20 rounded border border-slate-800" />
            Thumb impression / انگوٹھا
          </div>
          {g?.name && (
            <div>
              <div className="h-14 border-b border-slate-800" />
              Guarantor / ضامن
            </div>
          )}
          <div>
            <div className="h-14 border-b border-slate-800" />
            For {settings.shopName}
            {plan.userName && <div className="text-slate-500">{plan.userName}</div>}
          </div>
        </div>
        <p className="mt-6 text-center text-[11px] text-slate-500">Keep this agreement with copies of the buyer&apos;s and guarantor&apos;s CNIC.</p>
      </div>
    </div>
  );
}
