"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, Download, FileText, MessageCircle, Printer, Search, SkipForward, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { WaModePicker } from "@/components/wa-mode";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { openWhatsApp, reminderMessage, waNumber } from "@/lib/whatsapp";

type Row = {
  _id: string;
  name: string;
  phone?: string;
  balance: number;
  creditLimit: number;
  buckets: { d0_30: number; d31_60: number; d61_90: number; d90: number };
  oldestDueAt: string | null;
  daysOverdue: number;
  lastPaymentAt: string | null;
  lastPurchaseAt: string | null;
  lastRemindedAt: string | null;
  reminders: number;
};
type Report = { rows: Row[]; totals: { customers: number; balance: number; d0_30: number; d31_60: number; d61_90: number; d90: number; withoutPhone: number } };

const daysAgo = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null);
const ago = (d: string | null) => {
  const n = daysAgo(d);
  return n === null ? "Never" : n === 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`;
};

export default function UdhaarReportPage() {
  const toast = useToast();
  const { settings } = useSession();
  const [data, setData] = useState<Report | null>(null);
  const [q, setQ] = useState("");
  const [age, setAge] = useState("0");
  const [minAmount, setMinAmount] = useState("");
  const [notReminded, setNotReminded] = useState(false);
  const [queue, setQueue] = useState<Row[] | null>(null);

  const load = useCallback(() => {
    api<Report>("/api/reminders/report").then(setData).catch((e) => toast.error(e.message));
  }, [toast]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (t && !r.name.toLowerCase().includes(t) && !r.phone?.includes(t)) return false;
      if (r.daysOverdue < Number(age)) return false;
      if (minAmount && r.balance < Number(minAmount)) return false;
      if (notReminded && r.lastRemindedAt && (daysAgo(r.lastRemindedAt) ?? 99) < 7) return false;
      return true;
    });
  }, [data, q, age, minAmount, notReminded]);

  const message = (r: Row) => reminderMessage(settings?.waTemplate, { name: r.name, amount: r.balance, shop: settings?.shopName ?? "", shopPhone: settings?.phone });

  async function send(r: Row) {
    const n = waNumber(r.phone);
    if (!n) return toast.error(`${r.name} has no valid mobile number. Add it in Customers Khata.`);
    openWhatsApp(n, message(r));
    await api("/api/reminders", { body: { partyId: r._id, kind: "reminder" } }).catch(() => {});
    setData((d) => d && { ...d, rows: d.rows.map((x) => (x._id === r._id ? { ...x, lastRemindedAt: new Date().toISOString(), reminders: x.reminders + 1 } : x)) });
  }

  function exportCsv() {
    const header = ["Customer", "Phone", "Balance", "0-30 days", "31-60 days", "61-90 days", "90+ days", "Oldest due", "Days overdue", "Last payment", "Last reminded"];
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = rows.map((r) =>
      [r.name, r.phone, r.balance, r.buckets.d0_30, r.buckets.d31_60, r.buckets.d61_90, r.buckets.d90, r.oldestDueAt?.slice(0, 10), r.daysOverdue, r.lastPaymentAt?.slice(0, 10), r.lastRemindedAt?.slice(0, 10)]
        .map(cell)
        .join(","),
    );
    const url = URL.createObjectURL(new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `udhaar-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = data?.totals;
  const shown = rows.reduce((s, r) => s + r.balance, 0);
  const sendable = rows.filter((r) => waNumber(r.phone));

  return (
    <div>
      <PageHeader
        title="Udhaar Report"
        urdu="ادھار رپورٹ"
        subtitle={`Who owes you, for how long, and WhatsApp reminders · ${formatDate(new Date(), true)}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Excel</Button>
            <Button icon={<BellRing className="h-4 w-4" />} disabled={!sendable.length} onClick={() => setQueue(sendable)}>
              Remind {sendable.length} on WhatsApp
            </Button>
          </div>
        }
      />

      {!data || !t ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total udhaar" value={formatPKR(t.balance)} icon={<Users className="h-5 w-5" />} tone="amber" hint={`${t.customers} customers`} />
            <StatCard label="Due 0–30 days" value={formatPKR(t.d0_30)} icon={<FileText className="h-5 w-5" />} tone="green" />
            <StatCard label="Due 31–90 days" value={formatPKR(t.d31_60 + t.d61_90)} icon={<FileText className="h-5 w-5" />} tone="violet" />
            <StatCard label="Over 90 days" value={formatPKR(t.d90)} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" hint="Follow up first" />
          </div>

          <Card>
            <div className="no-print flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="pl-10" />
              </div>
              <Select value={age} onChange={(e) => setAge(e.target.value)} className="xl:w-48">
                <option value="0">Any age</option>
                <option value="30">Older than 30 days</option>
                <option value="60">Older than 60 days</option>
                <option value="90">Older than 90 days</option>
              </Select>
              <Input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} type="number" min="0" placeholder="Min amount" className="xl:w-36" />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <input type="checkbox" checked={notReminded} onChange={(e) => setNotReminded(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                Not reminded in 7 days
              </label>
              <WaModePicker />
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={<Users className="h-8 w-8" />} title={data.rows.length ? "No customers match the filters" : "No udhaar! 🎉"} text={data.rows.length ? undefined : "Nobody owes you money right now."} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Customer</Th>
                    <Th className="text-right">Balance</Th>
                    <Th className="text-right">0–30</Th>
                    <Th className="text-right">31–60</Th>
                    <Th className="text-right">61–90</Th>
                    <Th className="text-right">90+</Th>
                    <Th>Last payment</Th>
                    <Th>Reminded</Th>
                    <Th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const overLimit = r.creditLimit > 0 && r.balance > r.creditLimit;
                    return (
                      <tr key={r._id} className="hover:bg-slate-50/60">
                        <Td>
                          <Link href={`/customers/${r._id}`} className="font-semibold text-slate-800 hover:text-brand-700">{r.name}</Link>
                          <div className="text-xs text-slate-400">
                            {r.phone || <span className="text-rose-500">No phone</span>}
                            {r.daysOverdue > 0 && ` · oldest ${r.daysOverdue} days`}
                          </div>
                        </Td>
                        <Td className="text-right font-bold text-slate-900">
                          {formatPKR(r.balance)}
                          {overLimit && <div><Badge color="red">Over limit</Badge></div>}
                        </Td>
                        <Td className="text-right text-slate-600">{r.buckets.d0_30 ? formatPKR(r.buckets.d0_30) : "—"}</Td>
                        <Td className="text-right text-slate-600">{r.buckets.d31_60 ? formatPKR(r.buckets.d31_60) : "—"}</Td>
                        <Td className="text-right text-amber-700">{r.buckets.d61_90 ? formatPKR(r.buckets.d61_90) : "—"}</Td>
                        <Td className="text-right font-semibold text-rose-600">{r.buckets.d90 ? formatPKR(r.buckets.d90) : "—"}</Td>
                        <Td className="text-slate-500">{ago(r.lastPaymentAt)}</Td>
                        <Td className="text-slate-500">{r.lastRemindedAt ? `${ago(r.lastRemindedAt)} (${r.reminders})` : "Never"}</Td>
                        <Td className="no-print text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" disabled={!waNumber(r.phone)} icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => send(r)}>
                              WhatsApp
                            </Button>
                            <a href={`/statement/${r._id}`} target="_blank" rel="noreferrer" title="Khata statement" aria-label={`Statement for ${r.name}`}>
                              <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} />
                            </a>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold">
                    <Td>Total ({rows.length})</Td>
                    <Td className="text-right">{formatPKR(shown)}</Td>
                    <Td className="text-right">{formatPKR(rows.reduce((s, r) => s + r.buckets.d0_30, 0))}</Td>
                    <Td className="text-right">{formatPKR(rows.reduce((s, r) => s + r.buckets.d31_60, 0))}</Td>
                    <Td className="text-right">{formatPKR(rows.reduce((s, r) => s + r.buckets.d61_90, 0))}</Td>
                    <Td className="text-right">{formatPKR(rows.reduce((s, r) => s + r.buckets.d90, 0))}</Td>
                    <Td colSpan={3} />
                  </tr>
                </tfoot>
              </Table>
            )}
          </Card>
        </>
      )}

      <ReminderQueue queue={queue} onClose={() => setQueue(null)} message={message} onSend={send} />
    </div>
  );
}

/** Goes through customers one by one: open WhatsApp with the message, then move to the next. */
function ReminderQueue({ queue, onClose, message, onSend }: { queue: Row[] | null; onClose: () => void; message: (r: Row) => string; onSend: (r: Row) => Promise<void> }) {
  const [i, setI] = useState(0);
  const [sent, setSent] = useState(0);
  useEffect(() => {
    setI(0);
    setSent(0);
  }, [queue]);
  if (!queue) return null;
  const r = queue[i];
  return (
    <Modal open onClose={onClose} title="WhatsApp reminders" size="md">
      {!r ? (
        <div className="py-6 text-center">
          <p className="text-lg font-bold text-slate-900">Done</p>
          <p className="text-sm text-slate-500">WhatsApp opened for {sent} of {queue.length} customers.</p>
          <Button className="mt-5" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Customer {i + 1} of {queue.length}</span>
            <div className="h-2 w-40 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${((i + 1) / queue.length) * 100}%` }} />
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between">
              <b className="text-slate-900">{r.name}</b>
              <b className="text-amber-700">{formatPKR(r.balance)}</b>
            </div>
            <div className="text-xs text-slate-500">{r.phone}</div>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-sans text-sm text-emerald-950">{message(r)}</pre>
          <p className="text-xs text-slate-500">WhatsApp opens with this message typed. Press Send there, then come back and tap Next.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" icon={<SkipForward className="h-4 w-4" />} onClick={() => setI(i + 1)}>Skip</Button>
            <Button
              icon={<MessageCircle className="h-4 w-4" />}
              onClick={async () => {
                await onSend(r);
                setSent(sent + 1);
                setI(i + 1);
              }}
            >
              Open WhatsApp & next
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
