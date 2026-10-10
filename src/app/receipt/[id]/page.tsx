"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { api, formatDate, PAYMENT_LABELS, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";

type Sale = {
  invoiceNo: string;
  createdAt: string;
  items: { name: string; qty: number; unit: string; price: number; discount: number; total: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  creditAmount: number;
  customerName?: string;
  cashierName?: string;
  status: string;
  fbrStatus?: string;
  fbrInvoiceNumber?: string;
  fbrReturnInvoiceNumber?: string;
  branchName?: string;
};
type Settings = { shopName: string; phone?: string; address?: string; ntn?: string; strn?: string; receiptFooter?: string };

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Receipt id={id} />
    </Suspense>
  );
}

function Receipt({ id }: { id: string }) {
  const search = useSearchParams();
  const [sale, setSale] = useState<Sale | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branchCount, setBranchCount] = useState(1);
  const [branchInfo, setBranchInfo] = useState<{ name: string; address?: string; phone?: string }[]>([]);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");

  useEffect(() => {
    Promise.all([
      api<Sale>(`/api/sales/${id}`),
      api<{ settings: Settings; branches?: { name: string }[] }>("/api/auth/me"),
      api<{ branches: { name: string; address?: string; phone?: string }[] }>("/api/branches").catch(() => ({ branches: [] })),
    ])
      .then(([s, me, br]) => {
        setSale(s);
        setSettings(me.settings);
        setBranchCount(me.branches?.length ?? 1);
        setBranchInfo(br.branches);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (sale?.fbrInvoiceNumber) {
      QRCode.toDataURL(sale.fbrInvoiceNumber, { margin: 0, width: 220, errorCorrectionLevel: "M" }).then(setQr).catch(() => {});
    }
  }, [sale]);

  const fbrReady = !sale?.fbrInvoiceNumber || !!qr;
  useEffect(() => {
    if (sale && fbrReady && search.get("print") === "1") setTimeout(() => window.print(), 300);
  }, [sale, fbrReady, search]);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!sale || !settings) return <p className="p-10 text-center text-slate-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[320px] justify-center gap-2">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print receipt
        </button>
        <button onClick={() => window.close()} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm">
          Close
        </button>
      </div>
      <div className="mx-auto w-[300px] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none">
        <div className="text-center">
          <div className="text-base font-bold uppercase">{settings.shopName}</div>
          {branchCount > 1 && sale.branchName && <div className="font-bold">{sale.branchName}</div>}
          {(() => {
            // Multi-branch shops print the selling branch's address and phone when it has them.
            const b = branchCount > 1 ? branchInfo.find((x) => x.name === sale.branchName) : undefined;
            const address = b?.address || settings.address;
            const phone = b?.phone || settings.phone;
            return (
              <>
                {address && <div>{address}</div>}
                {phone && <div>Ph: {phone}</div>}
              </>
            );
          })()}
          {settings.ntn && <div>NTN: {settings.ntn}</div>}
          {settings.strn && <div>STRN: {settings.strn}</div>}
        </div>
        <Divider />
        {sale.status === "returned" && <div className="mb-1 text-center font-bold">*** RETURNED ***</div>}
        <div className="flex justify-between"><span>Bill: {sale.invoiceNo}</span></div>
        <div>{formatDate(sale.createdAt, true)}</div>
        {sale.customerName && <div>Customer: {sale.customerName}</div>}
        {sale.cashierName && <div>Cashier: {sale.cashierName}</div>}
        <Divider />
        <div className="flex font-bold">
          <span className="flex-1">Item</span>
          <span className="w-20 text-right">Amount</span>
        </div>
        {sale.items.map((i, idx) => (
          <div key={idx} className="mt-1">
            <div>{i.name}</div>
            <div className="flex">
              <span className="flex-1 pl-2">
                {formatQty(i.qty)} {UNIT_LABELS[i.unit] ?? i.unit} × {formatPKR(i.price, { symbol: false })}
                {i.discount > 0 && ` -${formatPKR(i.discount, { symbol: false })}`}
              </span>
              <span className="w-20 text-right">{formatPKR(i.total, { symbol: false })}</span>
            </div>
          </div>
        ))}
        <Divider />
        <Line label="Subtotal" value={sale.subtotal} />
        {sale.discount > 0 && <Line label="Discount" value={-sale.discount} />}
        {sale.tax > 0 && <Line label={`Sales Tax ${sale.taxRate}%${Math.abs(sale.total - (sale.subtotal - sale.discount)) < 0.01 ? " (included)" : ""}`} value={sale.tax} />}
        <div className="mt-1 flex justify-between text-base font-bold">
          <span>TOTAL</span>
          <span>{formatPKR(sale.total)}</span>
        </div>
        <Divider />
        <Line label={`Paid (${PAYMENT_LABELS[sale.paymentMethod]})`} value={sale.amountPaid + sale.change} />
        {sale.change > 0 && <Line label="Change" value={sale.change} />}
        {sale.creditAmount > 0 && <Line label="Udhaar" value={sale.creditAmount} />}
        {sale.fbrInvoiceNumber && (
          <>
            <Divider />
            <div className="text-center">
              <div className="font-bold">FBR POS Invoice</div>
              <div className="break-all">{sale.fbrInvoiceNumber}</div>
              {sale.fbrReturnInvoiceNumber && <div className="break-all">Return: {sale.fbrReturnInvoiceNumber}</div>}
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="FBR invoice QR code" className="mx-auto mt-2 h-24 w-24" />
              )}
              <div className="mt-1 text-[10px]">Verify this invoice via FBR&apos;s Tax Asaan app</div>
            </div>
          </>
        )}
        {sale.fbrStatus === "pending" && !sale.fbrInvoiceNumber && (
          <>
            <Divider />
            <div className="text-center text-[11px]">FBR invoice number pending</div>
          </>
        )}
        <Divider />
        <div className="text-center">{settings.receiptFooter}</div>
        <div className="mt-2 text-center text-[10px]">Items: {sale.items.length}</div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{formatPKR(value)}</span>
    </div>
  );
}
