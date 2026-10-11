"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { api, formatDate, PAYMENT_LABELS, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";

type Ret = {
  returnNo: string;
  invoiceNo: string;
  createdAt: string;
  customerName?: string;
  branchName?: string;
  userName?: string;
  items: { name: string; unit: string; qty: number; total: number; serials?: { imei: string }[] }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  creditReduced: number;
  refund: number;
  refundMethod: string;
  reason?: string;
  fbrInvoiceNumber?: string;
};
type Settings = { shopName: string; phone?: string; address?: string; ntn?: string; receiptFooter?: string };

export default function ReturnReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <ReturnReceipt id={id} />
    </Suspense>
  );
}

function ReturnReceipt({ id }: { id: string }) {
  const search = useSearchParams();
  const [ret, setRet] = useState<Ret | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Ret>(`/api/returns/${id}`), api<{ settings: Settings }>("/api/auth/me")])
      .then(([r, me]) => {
        setRet(r);
        setSettings(me.settings);
        if (r.fbrInvoiceNumber) QRCode.toDataURL(r.fbrInvoiceNumber, { margin: 0, width: 220 }).then(setQr).catch(() => {});
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const ready = !!ret && (!ret.fbrInvoiceNumber || !!qr);
  useEffect(() => {
    if (ready && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [ready, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!ret || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const line = (label: string, value: string, bold = false) => (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[320px] justify-center gap-2">
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
          {ret.branchName && <div>{ret.branchName}</div>}
          {settings.phone && <div>Ph: {settings.phone}</div>}
          {settings.ntn && <div>NTN: {settings.ntn}</div>}
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-sm font-bold">RETURN / REFUND</div>
        <div>Return: {ret.returnNo}</div>
        <div>Against bill: {ret.invoiceNo}</div>
        <div>{formatDate(ret.createdAt, true)}</div>
        {ret.customerName && <div>Customer: {ret.customerName}</div>}
        {ret.userName && <div>By: {ret.userName}</div>}
        {ret.reason && <div>Reason: {ret.reason}</div>}
        <div className="my-2 border-t border-dashed border-black" />
        {ret.items.map((i, idx) => (
          <div key={idx}>
            <div className="flex justify-between">
              <span className="pr-2">
                {i.name} × {formatQty(i.qty)} {UNIT_LABELS[i.unit] ?? i.unit}
              </span>
              <span>{formatPKR(i.total, { symbol: false })}</span>
            </div>
            {i.serials?.map((x) => (
              <div key={x.imei} className="pl-2 text-[11px]">IMEI: {x.imei}</div>
            ))}
          </div>
        ))}
        <div className="my-2 border-t border-dashed border-black" />
        {ret.discount > 0 && line("Less bill discount share", `-${formatPKR(ret.discount, { symbol: false })}`)}
        {ret.tax > 0 && line("Incl. sales tax", formatPKR(ret.tax))}
        {line("RETURN VALUE", formatPKR(ret.total), true)}
        <div className="my-2 border-t border-dashed border-black" />
        {ret.creditReduced > 0 && line("Udhaar reduced", formatPKR(ret.creditReduced))}
        {ret.refund > 0 &&
          line(ret.refundMethod === "khata" ? "Credited to khata" : `Refunded (${PAYMENT_LABELS[ret.refundMethod] ?? ret.refundMethod})`, formatPKR(ret.refund), true)}
        {ret.fbrInvoiceNumber && (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="text-center">
              <div className="font-bold">FBR Credit Note</div>
              <div className="break-all">{ret.fbrInvoiceNumber}</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="FBR credit note QR code" className="mx-auto mt-2 h-24 w-24" />
              )}
            </div>
          </>
        )}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center">{settings.receiptFooter}</div>
      </div>
    </div>
  );
}
