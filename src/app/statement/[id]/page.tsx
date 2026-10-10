"use client";

import { use, useCallback, useEffect, useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { openWhatsApp, statementMessage, waNumber } from "@/lib/whatsapp";
import { WaModePicker } from "@/components/wa-mode";

type Row = { _id: string; date: string; kind: string; refNo?: string; note?: string; method?: string; amount: number; balance: number };
type Statement = {
  party: { _id: string; name: string; phone?: string; address?: string; type: "customer" | "supplier" };
  from: string;
  to: string;
  opening: number;
  charges: number;
  payments: number;
  closing: number;
  rows: Row[];
};
type Me = { settings: { shopName: string; phone?: string; address?: string } };

const KIND: Record<string, string> = {
  sale: "Bill (udhaar)",
  purchase: "Purchase",
  payment: "Payment",
  return: "Bill returned",
  opening: "Old balance",
  adjustment: "Udhaar added",
};

export default function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [from, setFrom] = useState(todayISO(-89));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<Statement | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Statement>(`/api/parties/${id}/statement?from=${from}&to=${to}`).then(setData).catch((e) => setError(e.message));
  }, [id, from, to]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => {});
  }, []);

  if (error) return <p className="p-10 text-center text-rose-600">{error}</p>;
  if (!data || !me) return <p className="p-10 text-center text-slate-500">Loading…</p>;
  const isCustomer = data.party.type === "customer";
  const phone = waNumber(data.party.phone);

  async function share() {
    if (!data || !me || !phone) return;
    openWhatsApp(
      phone,
      statementMessage({
        shop: me.settings.shopName,
        shopPhone: me.settings.phone,
        name: data.party.name,
        from: data.from,
        to: data.to,
        opening: data.opening,
        closing: data.closing,
        rows: data.rows,
      }),
    );
    if (isCustomer) await api("/api/reminders", { body: { partyId: data.party._id, kind: "statement" } }).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl border border-slate-300 px-3" />
          <span className="text-slate-400">to</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl border border-slate-300 px-3" />
        </div>
        <div className="flex flex-wrap gap-2">
          <WaModePicker />
          <button
            onClick={share}
            disabled={!phone}
            title={phone ? "" : "No valid mobile number"}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> Send on WhatsApp
          </button>
          <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 font-semibold text-slate-700 shadow-sm">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>
      <p className="no-print mx-auto mb-4 max-w-3xl px-4 text-xs text-slate-500">
        Tip: to send the full statement as a file, choose &quot;Save as PDF&quot; in the print window and attach the PDF in WhatsApp.
      </p>

      <div className="mx-auto max-w-3xl bg-white p-10 text-[13px] text-slate-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-2xl font-extrabold">{me.settings.shopName}</div>
            {me.settings.address && <div className="text-slate-600">{me.settings.address}</div>}
            {me.settings.phone && <div className="text-slate-600">Phone: {me.settings.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold uppercase tracking-wide">Khata Statement</div>
            <div className="urdu text-slate-500">کھاتہ اسٹیٹمنٹ</div>
            <div className="text-slate-600">{formatDate(data.from)} – {formatDate(data.to)}</div>
          </div>
        </div>

        <div className="mt-4 flex justify-between">
          <div>
            <div className="text-xs uppercase text-slate-500">{isCustomer ? "Customer" : "Supplier"}</div>
            <div className="text-base font-bold">{data.party.name}</div>
            {data.party.phone && <div className="text-slate-600">{data.party.phone}</div>}
            {data.party.address && <div className="text-slate-600">{data.party.address}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">{data.closing >= 0 ? (isCustomer ? "Balance due" : "You owe") : "Advance"}</div>
            <div className="text-3xl font-extrabold">{formatPKR(Math.abs(data.closing))}</div>
            <div className="text-xs text-slate-500">as of {formatDate(data.to)}</div>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Details</th>
              <th className="px-2 py-2 text-right">{isCustomer ? "Udhaar (+)" : "Bill (+)"}</th>
              <th className="px-2 py-2 text-right">Paid (−)</th>
              <th className="px-2 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1.5">{formatDate(data.from)}</td>
              <td className="px-2 py-1.5 font-semibold">Opening balance</td>
              <td />
              <td />
              <td className="px-2 py-1.5 text-right font-semibold">{formatPKR(data.opening)}</td>
            </tr>
            {data.rows.map((r) => (
              <tr key={r._id} className="border-b border-slate-100">
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-2 py-1.5">
                  {KIND[r.kind] ?? r.kind}
                  {r.refNo && <span className="text-slate-500"> · {r.refNo}</span>}
                  {r.note && r.note !== `Bill ${r.refNo}` && <span className="text-slate-500"> · {r.note}</span>}
                </td>
                <td className="px-2 py-1.5 text-right">{r.amount > 0 ? formatPKR(r.amount) : ""}</td>
                <td className="px-2 py-1.5 text-right">{r.amount < 0 ? formatPKR(-r.amount) : ""}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{formatPKR(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 font-bold">
              <td className="px-2 py-2" colSpan={2}>Totals for the period</td>
              <td className="px-2 py-2 text-right">{formatPKR(data.charges)}</td>
              <td className="px-2 py-2 text-right">{formatPKR(data.payments)}</td>
              <td className="px-2 py-2 text-right">{formatPKR(data.closing)}</td>
            </tr>
          </tfoot>
        </table>
        {data.rows.length === 0 && <p className="mt-4 text-center text-slate-500">No entries in this period.</p>}
        <p className="mt-10 text-center text-xs text-slate-500">
          Generated on {formatDate(new Date(), true)} · Please contact us if anything in this statement is not correct.
        </p>
      </div>
    </div>
  );
}
