"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { WALLET_TXN_LABELS, type WalletTxnType } from "@/lib/constants";

type Txn = { txnNo: string; type: WalletTxnType; walletName: string; amount: number; fee: number; cashEffect: number; method: string; customerNumber?: string; customerName?: string; packageName?: string; ref?: string; note?: string; reversed?: boolean; userName?: string; createdAt: string };
type Settings = { shopName: string; phone?: string; address?: string };

/** Customer slip for an Easyload / package / cash in / cash out / bill entry. */
export default function WalletSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Slip id={id} />
    </Suspense>
  );
}

function Slip({ id }: { id: string }) {
  const search = useSearchParams();
  const [t, setT] = useState<Txn | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<Txn>(`/api/wallet-txns/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([x, me]) => {
        setT(x);
        setS(me.settings);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (t && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [t, search]);
  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!t || !s) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const line = (label: string, value?: string, bold = false) =>
    value ? (
      <div className={`flex justify-between gap-2 ${bold ? "text-sm font-bold" : ""}`}>
        <span>{label}</span>
        <span className="text-right">{value}</span>
      </div>
    ) : null;
  const total = t.type === "cash_out" ? t.amount - t.fee : t.amount + (t.fee ?? 0);
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[360px] justify-center gap-2">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm">
          <Printer className="h-4 w-4" /> Print
        </button>
        <button onClick={() => window.close()} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm">Close</button>
      </div>
      <div className="mx-auto w-[300px] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none">
        <div className="text-center">
          <div className="text-base font-bold uppercase">{s.shopName}</div>
          {s.phone && <div>Ph: {s.phone}</div>}
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-sm font-bold uppercase">{WALLET_TXN_LABELS[t.type]}</div>
        {t.reversed && <div className="text-center font-bold">*** CANCELLED ***</div>}
        <div>{t.txnNo}</div>
        <div>{formatDate(t.createdAt, true)}</div>
        <div className="my-2 border-t border-dashed border-black" />
        {line("Via", t.walletName)}
        {line(t.type === "bill" ? "Bill / ref" : "Number", t.customerNumber)}
        {line("Name", t.customerName)}
        {line("Package", t.packageName)}
        {line("TID", t.ref)}
        {line("Amount", formatPKR(t.amount), true)}
        {t.fee > 0 && line(t.type === "cash_out" ? "Fee (deducted)" : "Fee", formatPKR(t.fee))}
        {line(t.type === "cash_out" ? "PAID TO YOU" : "TOTAL PAID", formatPKR(total), true)}
        {t.userName && <div className="mt-1">By: {t.userName}</div>}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center">Shukriya! / شکریہ</div>
      </div>
    </div>
  );
}
