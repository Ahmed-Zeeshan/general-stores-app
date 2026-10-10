"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Printer } from "lucide-react";
import { api, formatDate, PAYMENT_LABELS } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { waNumber } from "@/lib/whatsapp";
import { sendPaymentWhatsApp } from "@/components/receive-payment";

type Entry = {
  _id: string;
  kind: string;
  refNo?: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  method?: string;
  note?: string;
  createdAt: string;
  userName?: string | null;
  branchName?: string | null;
  reversed?: boolean;
  reversedAt?: string;
  reversedByName?: string | null;
  reverseReason?: string;
  party: { type: "customer" | "supplier"; name: string; phone?: string; address?: string } | null;
};
type Settings = { shopName: string; phone?: string; address?: string; ntn?: string; receiptFooter?: string; waPaymentTemplate?: string };

export default function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <PaymentReceipt id={id} />
    </Suspense>
  );
}

function PaymentReceipt({ id }: { id: string }) {
  const search = useSearchParams();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Entry>(`/api/ledger/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([e, me]) => {
        if (e.kind !== "payment") throw new Error("This khata entry is not a payment.");
        setEntry(e);
        setSettings(me.settings);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (entry && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [entry, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!entry || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const isCustomer = entry.party?.type !== "supplier";
  const paid = Math.abs(entry.amount);
  const before = entry.balanceBefore;
  const after = entry.balanceAfter;
  const status = after > 0.004 ? "PART PAYMENT" : after < -0.004 ? "PAID IN FULL + ADVANCE" : "PAID IN FULL";
  const line = (label: string, value: string, bold = false) => (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  const canWa = isCustomer && !entry.reversed && !!waNumber(entry.party?.phone);

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[360px] flex-wrap justify-center gap-2">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print
        </button>
        {canWa && entry.party && (
          <button
            onClick={() => sendPaymentWhatsApp(settings, entry.party!, entry)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-emerald-700 shadow-sm"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        )}
        <button onClick={() => window.close()} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm">
          Close
        </button>
      </div>
      <div className="relative mx-auto w-[300px] overflow-hidden bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none">
        {entry.reversed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 rounded border-4 border-black/60 px-3 py-1 text-3xl font-black tracking-widest text-black/60">CANCELLED</span>
          </div>
        )}
        <div className="text-center">
          <div className="text-base font-bold uppercase">{settings.shopName}</div>
          {entry.branchName && <div>{entry.branchName}</div>}
          {settings.address && <div>{settings.address}</div>}
          {settings.phone && <div>Ph: {settings.phone}</div>}
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-sm font-bold">{isCustomer ? "PAYMENT RECEIPT" : "PAYMENT VOUCHER"}</div>
        <div className="text-center" dir="rtl">{isCustomer ? "وصولی رسید" : "ادائیگی واؤچر"}</div>
        <div className="mt-1">{isCustomer ? "Receipt" : "Voucher"}: {entry.refNo}</div>
        <div>{formatDate(entry.createdAt, true)}</div>
        <div>{isCustomer ? "Received from" : "Paid to"}: {entry.party?.name}</div>
        {entry.party?.phone && <div>Phone: {entry.party.phone}</div>}
        <div className="my-2 border-t border-dashed border-black" />
        {line(isCustomer ? "Previous udhaar" : "Previous payable", formatPKR(before))}
        {line(isCustomer ? "AMOUNT RECEIVED" : "AMOUNT PAID", formatPKR(paid), true)}
        {line("Paid by", PAYMENT_LABELS[entry.method ?? "cash"] ?? entry.method ?? "Cash")}
        <div className="my-2 border-t border-dashed border-black" />
        {after < -0.004 ? line("Advance (jama)", formatPKR(-after), true) : line(isCustomer ? "REMAINING UDHAAR" : "REMAINING PAYABLE", formatPKR(after), true)}
        <div className="mt-1 text-center font-bold">{status}</div>
        {entry.note && <div className="mt-1">Note: {entry.note}</div>}
        {entry.userName && <div className="mt-1">{isCustomer ? "Received by" : "Paid by"}: {entry.userName}</div>}
        {entry.reversed && (
          <div className="mt-2 border border-black p-1.5 text-center">
            Cancelled {entry.reversedAt ? formatDate(entry.reversedAt, true) : ""}
            {entry.reversedByName && ` by ${entry.reversedByName}`}
            {entry.reverseReason && <div>{entry.reverseReason}</div>}
          </div>
        )}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="mt-6 flex justify-between gap-4 text-[11px]">
          <div className="flex-1 border-t border-black pt-1 text-center">{isCustomer ? "Customer" : "Supplier"}</div>
          <div className="flex-1 border-t border-black pt-1 text-center">Shop</div>
        </div>
        <div className="mt-3 text-center">{isCustomer ? "Shukriya! / شکریہ" : settings.receiptFooter}</div>
      </div>
    </div>
  );
}
