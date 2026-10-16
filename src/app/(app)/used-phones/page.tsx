"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, FileText, Plus, Search, Smartphone } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Spinner, StatCard, Table, Td, Textarea, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useToast } from "@/components/toast";
import { api, formatDate, PAYMENT_LABELS, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";
import { useT } from "@/lib/i18n";

type UsedRow = {
  _id: string;
  buyNo: string;
  createdAt: string;
  seller: { name: string; cnic: string; phone: string; address?: string };
  productName: string;
  imei: string;
  imei2?: string;
  color?: string;
  storage?: string;
  price: number;
  askingPrice?: number;
  method: string;
  status: "completed" | "cancelled";
  cancelReason?: string;
  userName?: string;
};

const METHOD: Record<string, string> = { ...PAYMENT_LABELS, khata: "Customer khata" };

export default function UsedPhonesPage() {
  const toast = useToast();
  const t = useT();
  const [range, setRange] = useState({ from: todayISO(-89), to: todayISO() });
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UsedRow[] | null>(null);
  const [cancelling, setCancelling] = useState<UsedRow | null>(null);
  // Opened from search: ?q=…&from=…&to=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("q")) setQ(p.get("q")!);
    if (p.get("from") && p.get("to")) setRange({ from: p.get("from")!, to: p.get("to")! });
  }, []);

  const load = useCallback(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (q.trim()) p.set("q", q.trim());
    api<UsedRow[]>(`/api/used-phones?${p}`)
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, [range, q, toast]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const done = (rows ?? []).filter((r) => r.status === "completed");
  return (
    <div>
      <PageHeader
        title="Used Phones Bought"
        urdu="پرانے فون کی خریداری"
        subtitle="Phones bought from customers, with the seller's CNIC and a signed agreement"
        actions={
          <Link href="/used-phones/new">
            <Button icon={<Plus className="h-4 w-4" />}>Buy a used phone</Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Phones bought" value={done.length} icon={<Smartphone className="h-5 w-5" />} hint="in the dates chosen" />
        <StatCard label="Paid to sellers" value={formatPKR(done.reduce((a, r) => a + r.price, 0))} icon={<FileText className="h-5 w-5" />} tone="violet" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <div className="relative lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Name, CNIC, IMEI, mobile no.")} className="pl-9" aria-label="Search used phones" />
          </div>
        </div>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Smartphone className="h-7 w-7" />} title="No used phones bought" text="When a customer sells you a phone, record it here with their CNIC — the phone goes into stock for resale." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>No.</Th>
                <Th>Phone</Th>
                <Th>Seller</Th>
                <Th className="text-right">Paid</Th>
                <Th>Date</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <Td>
                    <div className="font-semibold text-slate-800">{r.buyNo}</div>
                    {r.status === "cancelled" && <Badge color="red">Cancelled</Badge>}
                  </Td>
                  <Td>
                    <div className="font-semibold text-slate-800">{r.productName}</div>
                    <div className="font-mono text-xs text-slate-500">{r.imei}</div>
                  </Td>
                  <Td>
                    <div>{r.seller.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.seller.cnic} · {r.seller.phone}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="font-semibold">{formatPKR(r.price)}</div>
                    <div className="text-xs text-slate-500">{t(METHOD[r.method] ?? r.method)}</div>
                  </Td>
                  <Td className="text-slate-500">{formatDate(r.createdAt, true)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <a href={`/receipt/used/${r._id}`} target="_blank">
                        <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />}>
                          Agreement
                        </Button>
                      </a>
                      {r.status === "completed" && (
                        <Button size="sm" variant="ghost" className="hover:text-rose-600" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(r)} aria-label={`Cancel ${r.buyNo}`} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CancelModal row={cancelling} onClose={() => setCancelling(null)} onDone={load} />
    </div>
  );
}

function CancelModal({ row, onClose, onDone }: { row: UsedRow | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(""), [row]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    try {
      await api(`/api/used-phones/${row._id}/cancel`, { body: { reason } });
      toast.success(t("{no} cancelled", { no: row.buyNo }));
      onClose();
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!row} onClose={onClose} title={row ? t("Cancel {no}?", { no: row.buyNo }) : ""} size="sm">
      {row && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">
            {t(row.method === "khata" ? "Use this only if it was entered by mistake. {name} (IMEI {imei}) is taken out of stock and the amount is taken back from the customer's khata." : "Use this only if it was entered by mistake. {name} (IMEI {imei}) is taken out of stock; take the money back from the seller.", { name: row.productName, imei: row.imei })}
          </p>
          <Field label="Why?">
            <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Keep it</Button>
            <Button type="submit" variant="danger" loading={busy}>Cancel purchase</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
