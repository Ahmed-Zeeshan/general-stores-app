"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { api, formatDate, PAYMENT_LABELS, UNIT_LABELS } from "@/lib/client";
import { getPrintPrefs } from "@/lib/print";
import { formatPKR, formatQty } from "@/lib/money";

type Sale = {
  invoiceNo: string;
  createdAt: string;
  items: {
    name: string;
    qty: number;
    unit: string;
    price: number;
    discount: number;
    total: number;
    pack?: { name: string; size: number; count: number; price: number };
    promo?: { name: string; amount: number };
    serials?: { imei: string; imei2?: string; returned?: boolean }[];
    warrantyMonths?: number;
    warrantyUntil?: string;
  }[];
  promo?: { name: string; amount: number };
  pointsRedeemed?: number;
  pointsValue?: number;
  pointsEarned?: number;
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
  paymentMethod: string;
  payments?: { method: string; amount: number; ref?: string }[];
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
  // 58 mm printers are set per computer in Settings → Printing.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => setNarrow(getPrintPrefs().paper === "58"), []);
  const [returns, setReturns] = useState<{ _id: string; returnNo: string; createdAt: string; total: number; items: { name: string; qty: number }[] }[]>([]);
  useEffect(() => {
    api<typeof returns>(`/api/sales/${id}/return`).then(setReturns).catch(() => {});
  }, [id]);

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
  const copies = search.get("copies") === "2" ? 2 : 1;
  const body = (
    <>
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
        {sale.status === "partially_returned" && <div className="mb-1 text-center font-bold">*** PART RETURNED ***</div>}
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
                {i.pack
                  ? `${formatQty(i.pack.count)} ${i.pack.name} (${formatQty(i.pack.size)}) × ${formatPKR(i.pack.price, { symbol: false })}`
                  : `${formatQty(i.qty)} ${UNIT_LABELS[i.unit] ?? i.unit} × ${formatPKR(i.price, { symbol: false })}`}
                {i.discount > 0 && ` -${formatPKR(i.discount, { symbol: false })}`}
              </span>
              <span className="w-20 text-right">{formatPKR(i.total, { symbol: false })}</span>
            </div>
            {i.promo && <div className="pl-2 text-[11px]">* {i.promo.name}: -{formatPKR(i.promo.amount, { symbol: false })}</div>}
            {i.serials?.map((x) => (
              <div key={x.imei} className="pl-2 text-[11px]">
                IMEI: {x.imei}
                {x.imei2 && ` / ${x.imei2}`}
                {x.returned && " (returned)"}
              </div>
            ))}
            {i.warrantyUntil && (
              <div className="pl-2 text-[11px]">
                Warranty {i.warrantyMonths} months, till {formatDate(i.warrantyUntil)}
              </div>
            )}
          </div>
        ))}
        <Divider />
        <Line label="Subtotal" value={sale.subtotal} />
        {sale.promo && sale.promo.amount > 0 && <Line label={`Offer: ${sale.promo.name}`} value={-sale.promo.amount} />}
        {(sale.pointsValue ?? 0) > 0 && <Line label={`Points used (${sale.pointsRedeemed})`} value={-(sale.pointsValue ?? 0)} />}
        {sale.discount - (sale.promo?.amount ?? 0) - (sale.pointsValue ?? 0) > 0.004 && <Line label="Discount" value={-(sale.discount - (sale.promo?.amount ?? 0) - (sale.pointsValue ?? 0))} />}
        {sale.tax > 0 && <Line label={`Sales Tax ${sale.taxRate}%${Math.abs(sale.total - (sale.subtotal - sale.discount)) < 0.01 ? " (included)" : ""}`} value={sale.tax} />}
        <div className="mt-1 flex justify-between text-base font-bold">
          <span>TOTAL</span>
          <span>{formatPKR(sale.total)}</span>
        </div>
        <Divider />
        {sale.payments?.length ? (
          sale.payments.map((p) => (
            // Cash shows what the customer handed over; the change is on the next line.
            <Line key={p.method} label={`${PAYMENT_LABELS[p.method] ?? p.method}${p.ref ? ` #${p.ref}` : ""}`} value={p.method === "cash" ? p.amount + sale.change : p.amount} />
          ))
        ) : sale.amountPaid + sale.change > 0 ? (
          <Line label={`Paid (${PAYMENT_LABELS[sale.paymentMethod]})`} value={sale.amountPaid + sale.change} />
        ) : null}
        {sale.change > 0 && <Line label="Change" value={sale.change} />}
        {sale.creditAmount > 0 && <Line label="Udhaar" value={sale.creditAmount} />}
        {(sale.pointsEarned ?? 0) > 0 && <div className="mt-1 text-center">Points earned on this bill: {sale.pointsEarned}</div>}
        {returns.length > 0 && (
          <>
            <Divider />
            <div className="font-bold">Returns</div>
            {returns.map((r) => (
              <div key={r._id} className="mt-1">
                <div className="flex justify-between">
                  <span>{r.returnNo} · {formatDate(r.createdAt)}</span>
                  <span>-{formatPKR(r.total, { symbol: false })}</span>
                </div>
                <div className="pl-2 text-[11px]">{r.items.map((i) => `${i.name} ×${formatQty(i.qty)}`).join(", ")}</div>
              </div>
            ))}
          </>
        )}
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
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: ${narrow ? "58mm" : "80mm"} auto; margin: ${narrow ? "2mm" : "4mm"}; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[320px] justify-center gap-2">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          <Printer className="h-4 w-4" /> Print receipt
        </button>
        <button onClick={() => window.close()} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm">
          Close
        </button>
      </div>
      {Array.from({ length: copies }, (_, n) => (
        <div
          key={n}
          className={`mx-auto bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-lg print:w-full print:p-0 print:shadow-none ${narrow ? "w-[220px] text-[11px]" : "w-[300px]"} ${n > 0 ? "mt-6 print:mt-0 print:break-before-page" : ""}`}
        >
          {n > 0 && <div className="mb-1 text-center font-bold">*** SHOP COPY ***</div>}
          {body}
          {n > 0 && sale.creditAmount > 0 && (
            <div className="mt-8 border-t border-black pt-1 text-center text-[11px]">
              Customer signature — {sale.customerName} accepts udhaar of {formatPKR(sale.creditAmount)}
            </div>
          )}
        </div>
      ))}
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
