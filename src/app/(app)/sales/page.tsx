"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Receipt, RotateCcw, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner, StatCard, Table, Td, Th } from "@/components/ui";
import { DateRange } from "@/components/date-range";
import { useCan } from "@/components/session";
import { useToast } from "@/components/toast";
import { api, formatDate, PAYMENT_LABELS, todayISO } from "@/lib/client";
import { formatPKR } from "@/lib/money";

type Sale = {
  _id: string;
  invoiceNo: string;
  total: number;
  paymentMethod: string;
  customerName?: string;
  cashierName?: string;
  createdAt: string;
  status: string;
  items: unknown[];
  creditAmount: number;
  fbrStatus?: string;
  fbrInvoiceNumber?: string;
  fbrError?: string;
};

export default function SalesPage() {
  const toast = useToast();
  const can = useCan();
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [q, setQ] = useState("");
  const [sales, setSales] = useState<Sale[] | null>(null);

  const load = useCallback(() => {
    api<Sale[]>(`/api/sales?from=${range.from}&to=${range.to}&q=${encodeURIComponent(q)}`).then(setSales).catch((e) => toast.error(e.message));
  }, [range, q, toast]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function returnSale(s: Sale) {
    if (!confirm(`Return full bill ${s.invoiceNo}? Stock will be added back${s.creditAmount ? " and udhaar removed" : ""}. Give ${formatPKR(s.total - s.creditAmount)} back to the customer.`)) return;
    try {
      await api(`/api/sales/${s._id}/return`, { method: "POST" });
      toast.success("Bill returned");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const completed = sales?.filter((s) => s.status === "completed") ?? [];
  const total = completed.reduce((a, s) => a + s.total, 0);

  return (
    <div>
      <PageHeader title="Sales History" urdu="فروخت" subtitle="All bills made in your shop" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total sales" value={formatPKR(total)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Bills" value={completed.length} icon={<Receipt className="h-5 w-5" />} tone="blue" />
        <StatCard label="Average bill" value={formatPKR(completed.length ? total / completed.length : 0)} icon={<Receipt className="h-5 w-5" />} tone="violet" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <div className="relative xl:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no. or customer" className="pl-10" />
          </div>
        </div>
        {!sales ? (
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
                    <div className="text-xs text-slate-400">{s.items.length} items · {s.cashierName}</div>
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
                      <Badge color={s.paymentMethod === "credit" ? "amber" : s.paymentMethod === "cash" ? "green" : "blue"}>{PAYMENT_LABELS[s.paymentMethod]}</Badge>
                    )}
                    {s.creditAmount > 0 && s.paymentMethod !== "credit" && s.status !== "returned" && (
                      <span className="ml-1 text-xs text-amber-700">+{formatPKR(s.creditAmount)} udhaar</span>
                    )}
                  </Td>
                  <Td className="text-right font-bold text-slate-900">{formatPKR(s.total)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/receipt/${s._id}`} target="_blank">
                        <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />}>View</Button>
                      </Link>
                      {can.manage && s.status === "completed" && (
                        <Button size="sm" variant="ghost" className="hover:text-rose-600" icon={<RotateCcw className="h-4 w-4" />} onClick={() => returnSale(s)}>
                          Return
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
