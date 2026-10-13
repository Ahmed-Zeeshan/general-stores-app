"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, MessageCircle, Receipt, RotateCcw, Search, Undo2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { BranchFilter } from "@/components/branch-filter";
import { ReturnModal, type ReturnableSale } from "@/components/return-modal";
import { useCan, useSession } from "@/components/session";
import { SendBillModal } from "@/components/send-whatsapp";
import { useToast } from "@/components/toast";
import { api, formatDate, PAYMENT_LABELS, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";

type Sale = ReturnableSale & {
  cashierName?: string;
  fbrStatus?: string;
  fbrInvoiceNumber?: string;
  fbrError?: string;
  branchName?: string;
  offline?: boolean;
  payments?: { method: string; amount: number }[];
};
type Ret = {
  _id: string;
  returnNo: string;
  invoiceNo: string;
  sale: string;
  customerName?: string;
  items: { name: string; qty: number }[];
  total: number;
  refund: number;
  creditReduced: number;
  refundMethod: string;
  reason?: string;
  userName?: string;
  branchName?: string;
  createdAt: string;
  fbrStatus?: string;
};

export default function SalesPage() {
  const toast = useToast();
  const can = useCan();
  const [tab, setTab] = useState<"bills" | "returns">("bills");
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [returns, setReturns] = useState<Ret[] | null>(null);
  const [returning, setReturning] = useState<Sale | null>(null);
  const showBranch = branch === "all";
  const { settings } = useSession();
  const [waBill, setWaBill] = useState<string | null>(null);
  // Opened from search: ?q=…&from=…&to=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("q")) setQ(p.get("q")!);
    if (p.get("from") && p.get("to")) setRange({ from: p.get("from")!, to: p.get("to")! });
  }, []);

  const load = useCallback(() => {
    const qs = `from=${range.from}&to=${range.to}&branch=${branch}&q=${encodeURIComponent(q)}`;
    api<Sale[]>(`/api/sales?${qs}`).then(setSales).catch((e) => toast.error(e.message));
    api<Ret[]>(`/api/returns?${qs}`).then(setReturns).catch(() => setReturns([]));
  }, [range, branch, q, toast]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const gross = sales?.reduce((a, s) => a + s.total, 0) ?? 0;
  const returned = returns?.reduce((a, r) => a + r.total, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Sales History" urdu="فروخت" subtitle="All bills and returns in your shop" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatPKR(gross)} icon={<Receipt className="h-5 w-5" />} hint={`${sales?.length ?? 0} bills`} />
        <StatCard label="Returns" value={formatPKR(returned)} icon={<Undo2 className="h-5 w-5" />} tone="rose" hint={`${returns?.length ?? 0} returns`} />
        <StatCard label="Net sales" value={formatPKR(gross - returned)} icon={<Receipt className="h-5 w-5" />} tone="violet" hint="Sales − returns" />
        <StatCard label="Average bill" value={formatPKR(sales?.length ? gross / sales.length : 0)} icon={<Receipt className="h-5 w-5" />} tone="blue" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "bills", label: "Bills" },
                { value: "returns", label: `Returns${returns?.length ? ` (${returns.length})` : ""}` },
              ]}
            />
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <BranchFilter value={branch} onChange={setBranch} />
          </div>
          <div className="relative xl:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no., return no. or customer" className="pl-10" />
          </div>
        </div>

        {tab === "bills" ? (
          !sales ? (
            <Spinner />
          ) : sales.length === 0 ? (
            <EmptyState icon={<Receipt className="h-8 w-8" />} title="No bills in this period" action={<Link href="/pos"><Button>Make a bill</Button></Link>} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>Date & time</Th>
                  <Th>Customer</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s._id} className={s.status === "returned" ? "opacity-60" : "hover:bg-slate-50/60"}>
                    <Td>
                      <div className="font-semibold text-slate-800">{s.invoiceNo}</div>
                      <div className="text-xs text-slate-400">
                        {s.items.length} items · {s.cashierName}
                        {showBranch && s.branchName && ` · ${s.branchName}`}
                        {s.offline && " · made offline"}
                      </div>
                    </Td>
                    <Td className="text-slate-500">{formatDate(s.createdAt, true)}</Td>
                    <Td>
                      {s.customerName ?? <span className="text-slate-400">Walk-in</span>}
                      {s.fbrStatus === "synced" && <div className="text-xs text-emerald-700">FBR ✓</div>}
                      {s.fbrStatus === "pending" && <div className="text-xs text-amber-700" title={s.fbrError}>FBR pending</div>}
                    </Td>
                    <Td>
                      {s.status === "returned" ? (
                        <Badge color="red">Returned</Badge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {(s.payments?.length ?? 0) > 1 ? (
                            <Badge color="violet">Split: {s.payments!.map((p) => PAYMENT_LABELS[p.method] ?? p.method).join(" + ")}</Badge>
                          ) : (
                            <Badge color={s.paymentMethod === "credit" ? "amber" : s.paymentMethod === "cash" ? "green" : "blue"}>{PAYMENT_LABELS[s.paymentMethod]}</Badge>
                          )}
                          {s.status === "partially_returned" && <Badge color="red">Part returned</Badge>}
                        </div>
                      )}
                      {s.creditAmount > 0 && s.paymentMethod !== "credit" && s.status !== "returned" && (
                        <span className="text-xs text-amber-700">+{formatPKR(s.creditAmount)} udhaar</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="font-bold text-slate-900">{formatPKR(s.total)}</div>
                      {(s.returnedTotal ?? 0) > 0 && s.status !== "returned" && <div className="text-xs text-rose-600">−{formatPKR(s.returnedTotal!)} returned</div>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/receipt/${s._id}`} target="_blank">
                          <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />}>View</Button>
                        </Link>
                        <Button size="sm" variant="ghost" aria-label={`WhatsApp ${s.invoiceNo}`} title="Send the bill on WhatsApp" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setWaBill(s._id)} />
                        {can.manage && s.status !== "returned" && (
                          <Button size="sm" variant="ghost" className="hover:text-rose-600" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setReturning(s)}>
                            Return
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : !returns ? (
          <Spinner />
        ) : returns.length === 0 ? (
          <EmptyState icon={<Undo2 className="h-8 w-8" />} title="No returns in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Return</Th>
                <Th>Date & time</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th className="text-right">Value</Th>
                <Th>Given back</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-800">{r.returnNo}</div>
                    <div className="text-xs text-slate-400">
                      bill {r.invoiceNo}
                      {r.userName && ` · ${r.userName}`}
                      {showBranch && r.branchName && ` · ${r.branchName}`}
                    </div>
                  </Td>
                  <Td className="text-slate-500">{formatDate(r.createdAt, true)}</Td>
                  <Td>{r.customerName ?? <span className="text-slate-400">Walk-in</span>}</Td>
                  <Td className="max-w-[260px] whitespace-normal text-slate-600">
                    {r.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                    {r.reason && <div className="text-xs text-slate-400">{r.reason}</div>}
                  </Td>
                  <Td className="text-right font-bold text-rose-600">{formatPKR(r.total)}</Td>
                  <Td className="text-sm">
                    {r.creditReduced > 0 && <div className="text-emerald-700">−{formatPKR(r.creditReduced)} udhaar</div>}
                    {r.refund > 0 && (
                      <div>
                        {formatPKR(r.refund)} {r.refundMethod === "khata" ? "to khata" : `(${PAYMENT_LABELS[r.refundMethod] ?? r.refundMethod})`}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Link href={`/receipt/return/${r._id}`} target="_blank">
                      <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />}>View</Button>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <SendBillModal saleId={waBill} open={!!waBill} onClose={() => setWaBill(null)} shop={{ shopName: settings?.shopName ?? "", phone: settings?.phone }} />
      <ReturnModal sale={returning} onClose={() => setReturning(null)} onDone={load} />
    </div>
  );
}
