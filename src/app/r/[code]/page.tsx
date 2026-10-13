"use client";

import { use, useEffect, useState } from "react";
import { CheckCircle2, Phone, Store } from "lucide-react";
import { formatDate, UNIT_LABELS } from "@/lib/client";
import { formatPKR, formatQty } from "@/lib/money";

type Shop = { name: string; phone?: string; address?: string };
type SaleData = {
  invoiceNo: string;
  createdAt: string;
  customerName?: string;
  items: { name: string; qty: number; unit: string; price: number; total: number; pack?: { name: string; count: number }; imeis: string[]; warrantyUntil?: string; returnedQty?: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  creditAmount: number;
  installment: boolean;
  status: string;
  fbrInvoiceNumber?: string;
};
type RepairData = {
  jobNo: string;
  createdAt: string;
  customerName: string;
  deviceName: string;
  problem: string;
  status: string;
  estimate?: number;
  promisedAt?: string;
  parts: { name: string; qty: number; price: number }[];
  labour: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  deliveredAt?: string;
  warrantyUntil?: string;
};
type PlanData = {
  planNo: string;
  createdAt: string;
  customerName: string;
  itemsText?: string;
  cashPrice: number;
  advance: number;
  financed: number;
  months: number;
  rows: { no: number; dueDate: string; amount: number; paid: number; left: number; state: "paid" | "part" | "due" | "late" }[];
  paid: number;
  balance: number;
  overdue: number;
  next: { dueDate: string; amount: number } | null;
  status: string;
};
type Doc = { kind: "sale"; shop: Shop; data: SaleData } | { kind: "repair"; shop: Shop; data: RepairData } | { kind: "installment"; shop: Shop; data: PlanData };

const REPAIR_STATUS: Record<string, string> = {
  received: "Received",
  checking: "Checking",
  waiting_parts: "Waiting for parts",
  repairing: "Repairing",
  ready: "Ready to collect",
  delivered: "Delivered",
  cancelled: "Returned without repair",
};

/** A bill, repair slip or installment plan the customer opens from a WhatsApp link (no login). */
export default function PublicDocPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/public/${encodeURIComponent(code)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "This link is not valid.");
        setDoc(j);
      })
      .catch((e) => setError(e.message));
  }, [code]);

  if (error) return <Shell><p className="py-16 text-center text-slate-500">{error}</p></Shell>;
  if (!doc) return <Shell><p className="py-16 text-center text-slate-400">Loading…</p></Shell>;
  const row = (label: string, value: React.ReactNode, strong = false) => (
    <div className={`flex justify-between gap-3 py-1 ${strong ? "text-base font-bold text-slate-900" : "text-sm text-slate-600"}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );

  return (
    <Shell>
      <div className="border-b border-slate-100 pb-4 text-center">
        <Store className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-1 text-xl font-extrabold text-slate-900">{doc.shop.name}</h1>
        {doc.shop.address && <p className="text-sm text-slate-500">{doc.shop.address}</p>}
        {doc.shop.phone && (
          <a href={`tel:${doc.shop.phone}`} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            <Phone className="h-4 w-4" /> {doc.shop.phone}
          </a>
        )}
      </div>

      {doc.kind === "sale" && (
        <div className="pt-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-slate-900">Bill {doc.data.invoiceNo}</h2>
            <span className="text-sm text-slate-500">{formatDate(doc.data.createdAt, true)}</span>
          </div>
          {doc.data.customerName && <p className="text-sm text-slate-500">{doc.data.customerName}</p>}
          {doc.data.status !== "completed" && <p className="mt-1 text-sm font-semibold text-amber-700">{doc.data.status === "returned" ? "This bill was returned." : "Some items were returned."}</p>}
          <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            {doc.data.items.map((i, n) => (
              <li key={n} className="py-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800">{i.name}</span>
                  <span className="font-semibold">{formatPKR(i.total)}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {i.pack ? `${i.pack.count} ${i.pack.name}` : `${formatQty(i.qty)} ${UNIT_LABELS[i.unit] ?? i.unit}`} × {formatPKR(i.price)}
                  {i.returnedQty ? ` · ${formatQty(i.returnedQty)} returned` : ""}
                </div>
                {i.imeis.length > 0 && <div className="font-mono text-xs text-slate-600">IMEI {i.imeis.join(", ")}</div>}
                {i.warrantyUntil && <div className="text-xs font-semibold text-emerald-700">Warranty till {formatDate(i.warrantyUntil)}</div>}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            {doc.data.discount > 0 && row("Discount", `−${formatPKR(doc.data.discount)}`)}
            {doc.data.tax > 0 && row("Sales tax", formatPKR(doc.data.tax))}
            {row("Total", formatPKR(doc.data.total), true)}
            {row(doc.data.installment ? "Advance paid" : "Paid", formatPKR(doc.data.paid))}
            {doc.data.creditAmount > 0 && !doc.data.installment && row("On udhaar (khata)", formatPKR(doc.data.creditAmount))}
            {doc.data.fbrInvoiceNumber && row("FBR invoice", doc.data.fbrInvoiceNumber)}
          </div>
        </div>
      )}

      {doc.kind === "repair" && (
        <div className="pt-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-slate-900">Repair {doc.data.jobNo}</h2>
            <span className="text-sm text-slate-500">{formatDate(doc.data.createdAt)}</span>
          </div>
          <div className={`mt-3 rounded-xl p-3 text-center font-bold ${doc.data.status === "ready" ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-800"}`}>
            {doc.data.status === "ready" && <CheckCircle2 className="mx-auto mb-1 h-6 w-6" />}
            {REPAIR_STATUS[doc.data.status] ?? doc.data.status}
          </div>
          <div className="mt-3">
            {row("Phone", doc.data.deviceName)}
            {row("Problem", doc.data.problem)}
            {doc.data.promisedAt && !["delivered", "cancelled"].includes(doc.data.status) && row("Ready by", formatDate(doc.data.promisedAt))}
            {doc.data.parts.map((p, n) => (
              <div key={n}>{row(`${p.name}${p.qty !== 1 ? ` ×${p.qty}` : ""}`, formatPKR(p.price * p.qty))}</div>
            ))}
            {doc.data.labour > 0 && row("Labour / service", formatPKR(doc.data.labour))}
            {doc.data.discount > 0 && row("Discount", `−${formatPKR(doc.data.discount)}`)}
            {doc.data.total > 0 ? row("Total", formatPKR(doc.data.total), true) : doc.data.estimate ? row("Estimate", formatPKR(doc.data.estimate), true) : null}
            {row("Paid", formatPKR(doc.data.paid))}
            {doc.data.balance > 0 && row("To pay", formatPKR(doc.data.balance), true)}
            {doc.data.warrantyUntil && row("Repair warranty till", formatDate(doc.data.warrantyUntil))}
          </div>
        </div>
      )}

      {doc.kind === "installment" && (
        <div className="pt-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-slate-900">Installments {doc.data.planNo}</h2>
            <span className="text-sm text-slate-500">{formatDate(doc.data.createdAt)}</span>
          </div>
          <p className="text-sm text-slate-600">{doc.data.itemsText}</p>
          <div className="mt-3">
            {row("In installments", formatPKR(doc.data.financed))}
            {row("Paid so far", formatPKR(doc.data.paid))}
            {row(doc.data.status === "completed" ? "All paid" : "Left to pay", formatPKR(doc.data.balance), true)}
            {doc.data.overdue > 0 && row("Late", <span className="font-bold text-rose-600">{formatPKR(doc.data.overdue)}</span>)}
            {doc.data.next && doc.data.status === "active" && row("Next", `${formatPKR(doc.data.next.amount)} on ${formatDate(doc.data.next.dueDate)}`)}
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {doc.data.rows.map((r) => (
                <tr key={r.no} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-500">{r.no}</td>
                  <td className="py-1.5">{formatDate(r.dueDate)}</td>
                  <td className="py-1.5 text-right">{formatPKR(r.amount)}</td>
                  <td className={`py-1.5 text-right text-xs font-semibold ${r.state === "paid" ? "text-emerald-700" : r.state === "late" ? "text-rose-600" : r.state === "part" ? "text-amber-700" : "text-slate-400"}`}>
                    {r.state === "paid" ? "Paid" : r.state === "late" ? "Late" : r.state === "part" ? "Part" : "Due"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Shukriya! · {doc.shop.name}</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-lg">{children}</div>
    </div>
  );
}
