"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";
import { REPAIR_STATUS_LABELS } from "@/lib/constants";
import type { RepairJob } from "@/components/repairs";

type Settings = { shopName: string; phone?: string; address?: string };

/** Job slip when the phone is booked in; repair bill once it is delivered. */
export default function RepairSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Slip id={id} />
    </Suspense>
  );
}

function Slip({ id }: { id: string }) {
  const search = useSearchParams();
  const [job, setJob] = useState<RepairJob | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<RepairJob>(`/api/repairs/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([j, me]) => {
        setJob(j);
        setSettings(me.settings);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (job && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [job, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!job || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const billed = job.status === "delivered" || job.status === "cancelled";
  const line = (label: string, value: string, bold = false) => (
    <div className={`flex justify-between gap-2 ${bold ? "text-sm font-bold" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
  const balance = job.balance ?? job.total - job.paid - (job.creditAmount ?? 0);
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
      <div className="mx-auto w-[300px] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none">
        <div className="text-center">
          <div className="text-base font-bold uppercase">{settings.shopName}</div>
          {job.branchName && <div>{job.branchName}</div>}
          {settings.address && <div>{settings.address}</div>}
          {settings.phone && <div>Ph: {settings.phone}</div>}
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-sm font-bold">{billed ? (job.status === "cancelled" ? "RETURNED WITHOUT REPAIR" : "REPAIR BILL") : "REPAIR JOB SLIP"}</div>
        <div className="text-center" dir="rtl">{billed ? "مرمت کا بل" : "مرمت کی رسید"}</div>
        <div className="mt-1 text-center text-lg font-bold">{job.jobNo}</div>
        <div>Booked: {formatDate(job.createdAt, true)}</div>
        {job.warrantyOf && <div>Warranty claim of {job.warrantyOf}</div>}
        <div>Customer: {job.customerName}</div>
        <div>Mobile: {job.customerPhone}</div>
        <div className="my-2 border-t border-dashed border-black" />
        <div>Phone: {[job.deviceName, job.color].filter(Boolean).join(" · ")}</div>
        {job.imei && <div>IMEI: {job.imei}</div>}
        <div>Problem: {job.problem}</div>
        {job.conditionNotes && <div>Condition: {job.conditionNotes}</div>}
        <div>Received with: {job.accessories?.length ? job.accessories.join(", ") : "phone only"}</div>
        {job.diagnosis && billed && <div>Work done: {job.diagnosis}</div>}
        <div className="my-2 border-t border-dashed border-black" />
        {!billed ? (
          <>
            {job.estimate ? line("Estimate", formatPKR(job.estimate)) : null}
            {line("Advance paid", formatPKR(job.paid), true)}
            {job.promisedAt && line("Ready by", formatDate(job.promisedAt))}
            {line("Status", REPAIR_STATUS_LABELS[job.status])}
            <div className="mt-2 text-[11px]">
              * Bring this slip to collect the phone.
              <br />* Please back up your data; the shop is not responsible for data loss.
              <br />* Phones not collected within 30 days of being ready are the customer&apos;s responsibility.
            </div>
          </>
        ) : (
          <>
            {(job.parts ?? []).map((p) => (
              <div key={p._id}>
                {line(`${p.name} ×${formatQty(p.qty)}`, formatPKR(p.qty * p.price))}
              </div>
            ))}
            {job.labour > 0 && line(job.status === "cancelled" ? "Checking charge" : "Labour / service", formatPKR(job.labour))}
            {job.discount > 0 && line("Discount", `-${formatPKR(job.discount)}`)}
            {line("TOTAL", formatPKR(job.total), true)}
            {job.payments.map((p, i) => (
              <div key={i}>{line(`${p.kind === "refund" ? "Given back" : p.kind === "advance" ? "Advance" : "Paid"} (${PAYMENT_LABELS[p.method] ?? p.method})`, formatPKR(p.amount))}</div>
            ))}
            {(job.creditAmount ?? 0) > 0 && line("On khata (udhaar)", formatPKR(job.creditAmount!), true)}
            {Math.abs(balance) > 0.004 && line("Balance", formatPKR(balance), true)}
            {job.warrantyUntil && <div className="mt-1 font-bold">Repair warranty till {formatDate(job.warrantyUntil)}</div>}
            {job.deliveredAt && <div>Delivered: {formatDate(job.deliveredAt, true)}</div>}
          </>
        )}
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
