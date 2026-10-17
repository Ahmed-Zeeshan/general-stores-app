"use client";

import { RefLink } from "@/components/ref-link";
import { use, useCallback, useEffect, useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { api, formatDate, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { openWhatsApp, statementMessage, waNumber } from "@/lib/whatsapp";
import { WaModePicker } from "@/components/wa-mode";

type Row = { _id: string; date: string; kind: string; refType?: string; refId?: string; refNo?: string; note?: string; method?: string; amount: number; balance: number };
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
  reversal: "Payment cancelled",
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

  const plus = (n: number) => (n > 0 ? formatPKR(n) : "");
  const minus = (n: number) => (n < 0 ? formatPKR(-n) : "");
  const details = (r: Row) => (
    <>
      {KIND[r.kind] ?? r.kind}
      {r.refNo && (
        <span className="text-slate-500">
          {" · "}
          <RefLink refType={r.refType} refId={r.refId ?? (r.refType === "payment" ? r._id : undefined)} className="hover:underline print:no-underline">
            {r.refNo}
          </RefLink>
        </span>
      )}
      {r.note && !(r.refNo && r.note.includes(r.refNo)) && <span className="text-slate-500"> · {r.note}</span>}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="no-print mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex w-full flex-wrap items-center gap-2 text-sm sm:w-auto">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 sm:flex-none" />
          <span className="text-slate-400">to</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 sm:flex-none" />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <WaModePicker />
          <button
            onClick={share}
            disabled={!phone}
            title={phone ? "" : "No valid mobile number"}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
          >
            <MessageCircle className="h-4 w-4" /> Send on WhatsApp
          </button>
          <button onClick={() => window.print()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 font-semibold text-slate-700 shadow-sm sm:flex-none">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>
      <p className="no-print mx-auto mb-3 max-w-3xl px-4 text-xs text-slate-500">
        Tip: to send the full statement as a file, choose &quot;Save as PDF&quot; in the print window and attach the PDF in WhatsApp.
      </p>

      <div className="mx-auto max-w-3xl bg-white p-4 text-[13px] text-slate-900 shadow-lg sm:p-10 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex flex-col gap-3 border-b-2 border-slate-900 pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
          <div className="min-w-0">
            <div className="text-xl font-extrabold break-words sm:text-2xl">{me.settings.shopName}</div>
            {me.settings.address && <div className="text-slate-600">{me.settings.address}</div>}
            {me.settings.phone && <div className="text-slate-600">Phone: {me.settings.phone}</div>}
          </div>
          <div className="shrink-0 sm:text-right print:text-right">
            <div className="text-base font-bold uppercase tracking-wide whitespace-nowrap sm:text-lg">Khata Statement</div>
            <div className="urdu text-left text-slate-500 sm:text-right print:text-right">کھاتہ اسٹیٹمنٹ</div>
            <div className="whitespace-nowrap text-slate-600">{formatDate(data.from)} – {formatDate(data.to)}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-between print:flex-row print:justify-between">
          <div className="min-w-0">
            <div className="text-xs uppercase text-slate-500">{isCustomer ? "Customer" : "Supplier"}</div>
            <div className="text-base font-bold break-words">{data.party.name}</div>
            {data.party.phone && <div className="text-slate-600">{data.party.phone}</div>}
            {data.party.address && <div className="text-slate-600">{data.party.address}</div>}
          </div>
          <div className="shrink-0 rounded-xl bg-slate-50 p-3 sm:bg-transparent sm:p-0 sm:text-right print:bg-transparent print:p-0 print:text-right">
            <div className="text-xs uppercase text-slate-500">{data.closing >= 0 ? (isCustomer ? "Balance due" : "You owe") : "Advance"}</div>
            <div className="text-2xl font-extrabold whitespace-nowrap sm:text-3xl">{formatPKR(Math.abs(data.closing))}</div>
            <div className="text-xs text-slate-500">as of {formatDate(data.to)}</div>
          </div>
        </div>

        {/* Phones: one compact row per entry. */}
        <div className="mt-5 sm:hidden print:hidden">
          <div className="flex justify-between border-y border-slate-300 bg-slate-50 px-2 py-2 text-xs font-semibold uppercase text-slate-500">
            <span>Details</span>
            <span>Amount · Balance</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-slate-100 px-2 py-2">
            <div>
              <div className="font-semibold">Balance brought forward</div>
              <div className="text-xs text-slate-500">{formatDate(data.from)}</div>
            </div>
            <div className="whitespace-nowrap text-right font-semibold">{formatPKR(data.opening)}</div>
          </div>
          {data.rows.map((r) => (
            <div key={r._id} className="flex justify-between gap-3 border-b border-slate-100 px-2 py-2">
              <div className="min-w-0 break-words">
                <div>{details(r)}</div>
                <div className="text-xs text-slate-500">{formatDate(r.date)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={r.amount > 0 ? "text-rose-700" : "text-emerald-700"}>{r.amount > 0 ? `+ ${plus(r.amount)}` : `− ${minus(r.amount)}`}</div>
                <div className="font-semibold">{formatPKR(r.balance)}</div>
              </div>
            </div>
          ))}
          <div className="mt-1 space-y-1 border-t-2 border-slate-900 px-2 pt-2 font-semibold">
            <div className="flex justify-between gap-3"><span>{isCustomer ? "Udhaar (+)" : "Bills (+)"}</span><span className="whitespace-nowrap">{formatPKR(data.charges)}</span></div>
            <div className="flex justify-between gap-3"><span>Paid (−)</span><span className="whitespace-nowrap">{formatPKR(data.payments)}</span></div>
            <div className="flex justify-between gap-3 text-base font-bold"><span>Balance</span><span className="whitespace-nowrap">{formatPKR(data.closing)}</span></div>
          </div>
        </div>

        {/* Tablets, computers and print: the full table. */}
        <table className="mt-6 hidden w-full border-collapse sm:table print:table">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-2 py-2 whitespace-nowrap">Date</th>
              <th className="w-full px-2 py-2">Details</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">{isCustomer ? "Udhaar (+)" : "Bill (+)"}</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Paid (−)</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(data.from)}</td>
              <td className="px-2 py-1.5 font-semibold">Balance brought forward</td>
              <td />
              <td />
              <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatPKR(data.opening)}</td>
            </tr>
            {data.rows.map((r) => (
              <tr key={r._id} className="border-b border-slate-100 align-top">
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-2 py-1.5 break-words">{details(r)}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{plus(r.amount)}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{minus(r.amount)}</td>
                <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatPKR(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 font-bold">
              <td className="px-2 py-2" colSpan={2}>Totals for the period</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">{formatPKR(data.charges)}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">{formatPKR(data.payments)}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">{formatPKR(data.closing)}</td>
            </tr>
          </tfoot>
        </table>
        {data.rows.length === 0 && <p className="mt-4 text-center text-slate-500">No entries in this period.</p>}
        <p className="mt-8 text-center text-xs text-slate-500 sm:mt-10">
          Generated on {formatDate(new Date(), true)} · Please contact us if anything in this statement is not correct.
        </p>
      </div>
    </div>
  );
}
